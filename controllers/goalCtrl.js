var Goal = require('../models/goal');
var http = require('http');
var QueryGenerator = require('./queryGenerator');
var Coordinator = require('./coordinator');
var fs = require('fs');

function discoveryBlockQuery(query, callback){
	var options = {
		host: 'localhost',
		path: '/query',
		method: 'POST',
		port: '3002'
	};
	
	var req = http.request(options, function(res){
		var str = '';
		res.setEncoding('utf8');
		res.on('data', function(chunk){
			str += chunk;
		});
		res.on('end', function(){
			callback(str);
		});
	});
	
	req.write(query);
	req.end();
}


//Punto di Partenza! Ricevo un goal da gestire.
//Chiamo la funzione elaborateGoal alla quale passo
//lo stream della risposta e il body ricevuto dalla richiesta
exports.postGoals = function(req, res){
	var body = '';
	req.on('data', function(data){
		body += data;
	});
	req.on('end', function(){
		elaborateGoal(res, body);
		
		var time = new Date().toISOString().replace(/\..+/, '').replace(/:/, '-').replace(/:/, '-');     
		var file = './requests/prova.json' + time + '.json';
		
		fs.writeFile(file, body, function (err) {
			console.log('File: ' + file +' scritto con successo');
		});
		
		
	});
};

//Funzione che ottiene target e room, e da questo genera
//la query che verrà inviata al discoveryBlock. Alla ricezione della risposta
//chiamo la callback per analizzare la risposta. Dalla risposta prendo l'url dei target
//al quale farò una request e rimando al mittente la risposta.
var elaborateGoal = function(res, body){

	var request = JSON.parse( body );
	var trigger = request.trigger;
	var action = request.action;
	
	var query = QueryGenerator.generateQuery(action);
	
	discoveryBlockQuery(query, function(response){
		
		var smartObjects = analyzeDiscoveryBlockResponse(response);
		
		if(smartObjects.length == 0){
			res.send("La ricerca non ha restituito risultati");
			return;
		}
		
		//console.log(smartObjects.length);
		requestToSmartObjects(action, smartObjects, res);
		
	});
};


var analyzeDiscoveryBlockResponse = function(queryResult){
	
	var object = JSON.parse( queryResult );

	var subjects = [];
	
	//Trovo tutti i soggetti delle mie frasi.
	for (var i in object){
		var tripla = object[i];
		if(!contains(subjects, tripla.subject)){
			subjects.push(tripla.subject);
		}
	}
	
	var smartObjects = [];
	
	//Per ogni soggetto prima trovato, ne prendo
	//url e guid che salvo nell'apposito oggetto da restituire.
	for (var j in subjects){
		
		var sub = subjects[j];

		var smartObject = new SmartObject();
		
		for(var i in object){
			var tripla = object[i];
			//console.log(tripla.subject, tripla.predicate, tripla.object);
			if(tripla.subject == sub && tripla.predicate == "http://example.org/smartobject#hasUrl"){
				smartObject.url = tripla.object.replace(/"/, '').replace(/"/, '');
			}
			if(tripla.subject == sub && tripla.predicate == "http://example.org/smartobject#hasGuid"){
				smartObject.guid = tripla.object.replace(/"/, '').replace(/"/, '');
			}
			if(tripla.subject == sub && tripla.predicate == "http://www.featureOfInterest.org/example#hasMethod"){
				smartObject.Methods.push(tripla.object.replace(/"/, '').replace(/"/, ''));
			}
			if(tripla.subject == sub && tripla.predicate == "http://www.featureOfInterest.org/example#effectOnFOI"){
				smartObject.effectOnFOI.push(tripla.object.replace(/"/, '').replace(/"/, ''));
			}
		}
		
		/*console.log(smartObject.url);
		console.log(smartObject.guid);
		console.log(smartObject.Methods);
		console.log(smartObject.effectOnFOI);*/
		
		smartObjects.push(smartObject);
	}
	
	return smartObjects;
};



var requestToSmartObjects = function(request, smartObjects, res){
	var target = request.target;
	var splitted = target.split(":");
	
	if(splitted.length == 1 || request.command.toLowerCase() == "get"){ //Object
		setRequestToTarget(request, smartObjects, res);
	}else if(splitted.length == 2){ //Feature
		Coordinator.sequenceOfTask(request, smartObjects, res);
	}
}

var setRequestToTarget = function(request, smartObjects, res){
	var risposte = [];
	var receivedResp = 0;
	
	for(var i in smartObjects){
		
		var smartObject = smartObjects[i];
		
		/*console.log(smartObject.url);
		console.log(smartObject.guid);
		console.log(smartObject.Methods);
		console.log(smartObject.effectOnFOI);*/
		
	
		var options = elaborateRequest(smartObject, request);
		if(options == null){
			res.send("Richiesta non valida. Impossibile invocare il metodo sull'oggetto specificato");
			return;
		}

		//Faccio una richiesta all'oggetto target.
		var reqTarget = http.request(options, function(respTarget){
			var risposta = '';
			
			respTarget.on('data', function (chunk) { risposta += chunk; });
			
			//Modificare da semplice GET ad altri metodi....
			respTarget.on('end', function () {
				
				try {
					var resp = JSON.parse(risposta);
					var respToClient = new ResponseToClient();
					respToClient.switch = resp.switch;
					respToClient.measuredVal = resp.measuredVal;
					respToClient.settedVal = resp.settedVal;
					respToClient.guid = smartObjects[receivedResp].guid;
					risposte.push(respToClient);
				} catch (e) {
					risposte.push(risposta);
				}

				receivedResp++;					
				if(receivedResp == smartObjects.length){
					res.statusCode = 200;
					res.send(JSON.stringify(risposte));
				}
			});
		}).end();
	}
};



var elaborateRequest = function(smartObject, request){
	
	//GET - PUT - DELETE - POST ?value=valore
	
	/*console.log(request);
	console.log(smartObject.url);
	console.log(smartObject.guid);
	console.log(smartObject.Methods);
	console.log(smartObject.effectOnFOI);*/
	

	var value = request.value; //ON - OFF - 5 - 15°C - Cold - Hot
	
	if(!value && request.command.toLowerCase() == "get"){
		var method = "GET";
	}else if(value.toLowerCase() == "on"){
		var method = "PUT";
	}else if(value.toLowerCase() == "off"){
		var method = "DELETE";
	}else{
		var method = "POST";
	}

	if(!hasMethod(smartObject, method)){
		return null;
	} 
	
	var url = smartObject.url;   //http://localhost:3003/MySmartTV2
	
	var splitted = url.split(":"); //   http - //localhost - 3003/MySmartTV2
	
	var hostname = splitted[1].replace('//', '');
	
	splitted = splitted[2].split("/");
	
	var port = splitted[0];
	var path = "/" + splitted[1];
	if(method == "POST") path += '?value=' + value;
	
	var options = {
		hostname: hostname,
		method: method,
		port: port,
		path: path
	};

	return options;
};

function hasMethod(smartObject, method){
	
	var mth;
	if(method == "GET"){
		mth = "GET";
	}else if(method == "PUT" || method == "DELETE"){
		mth = "SWITCH";
	}else if(method == "POST"){
		mth = "SET";
	}else{return false;}
	
	
	for (var i in smartObject.Methods){
		var objMethod = smartObject.Methods[i];
		/*console.log("objMethod " + objMethod);
		console.log("method " + mth);
		console.log("--");*/
		if(mth == objMethod) return true;
	}
	return false;
}

exports.analyzeDiscoveryBlockResp = function(queryResult){
	return analyzeDiscoveryBlockResponse(queryResult);
}



function contains(a, obj) {
    for (var i = 0; i < a.length; i++) {
        if (a[i] === obj) {
            return true;
        }
    }
    return false;
}
	
	
function SmartObject() {
	this.url = "";
	this.guid = "";
	this.Methods = [];
	this.effectOnFOI = [];
}


function ResponseToClient() {
	this.switch = "";
	this.measuredVal = "";
	this.settedVal = "";
	this.guid = "";
}



/*
HTTP METHOD
*/














// Create endpoint /api/beers for GET
exports.getGoals = function(req, res) {
  // Use the Beer model to find all beer
  /*Beer.find({userId: req.user._id}, function(err, beers) {
    if (err)
      res.send(err);

    res.json(beers);
  });*/
};

exports.deleteGoals = function(req, res){
	
};

// Create endpoint /api/beers/:beer_id for GET
exports.getGoal = function(req, res) {
  // Use the Beer model to find a specific beer
  /*Beer.findById({ userId: req.user._id, _id: req.params.beer_id }, function(err, beer) {
    if (err)
      res.send(err);

    res.json(beer);
  });*/
};

// Create endpoint /api/beers/:beer_id for DELETE
exports.deleteGoal = function(req, res) {
  // Use the Beer model to find a specific beer and remove it
  /*Beer.findByIdAndRemove({ userId: req.user._id, _id: req.params.beer_id }, function(err) {
    if (err)
      res.send(err);

    res.json({ message: 'Beer removed from the locker!' });
  });*/
};