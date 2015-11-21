var http = require('http');
var QueryGenerator = require('./queryGenerator');
var GoalCtrl = require('./goalCtrl');


function ResponseToClient() {
	this.switch = "";
	this.measuredVal = "";
	this.settedVal = "";
	this.guid = "";
}


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

/*
	Request. La richiesta ricevuta in forma di command, value, target, room
	smartObjects. Lista di oggetti capaci di settare la foi richiesta.
*/
exports.sequenceOfTask = function(request, smartObjects, res){
	
	var command = request.command;
	var value = request.value;
	var target = request.target;
	var room = request.room;
	
	if(!isNaN(value)){ //value è un numero
		setNumericValue(value, target, room, smartObjects, res);
		//Nel caso di un valore numerico, devo andare a leggere il valore
		// attuale e quindi intraprendere una azione di conseguenza.
	}else{//Value è qualcosa come HOT - COLD
	
		//Nel caso di valori concettuali, mi limito ad accendere i
		//device e settare in essi i valori MAX o MIN
		var query = QueryGenerator.effectOnFOI(value);
		discoveryBlockQuery(query, function(response){
			var ob = JSON.parse( response );
			if(ob.length > 0){
				var sign = ob[0].object.replace(/"/, '').replace(/"/, '');
				setConceptValue(sign, smartObjects, res);
			}else{
				setOnSmartObjects(smartObjects, res);
			}
		});
	}
};

var setNumericValue = function(value, target, room, smartObjects, res){
	//Set 15 foi:Temperature
	
	var query = QueryGenerator.measureFOI(target.split(":")[1], room);
		
	discoveryBlockQuery(query, function(response){
			
		var Objects = GoalCtrl.analyzeDiscoveryBlockResp(response);
			
		if(Objects.length == 0){
			res.send("La ricerca non ha restituito risultati");
			return;
		} 
			
		var options = produceHttpOptions(Objects[0].url, "GET");
			
		readTarget(options, function(readValue){

			if(readValue > value){
				var ob = selectGenerated("<", smartObjects);
			}else if(readValue < value){
				var ob = selectGenerated(">", smartObjects);
			}else{ //readValue raggiunto. non devo fare null.
				res.send("Target raggiunto");
				return;
			}
			
			
			//produceValueToTarget(ob, value,res);
			produceValueToTarget(ob, value, function(risp){
				res.statusCode = 200;
				res.send(risp);
				
				//Avviare monitoraggio in background per verificare la raggiunta dell'obiettivo?
				//var interval = setInterval(test, 1000);
			});
		});
	});
}




var readTarget = function(options, callback){
	var reqTarget = http.request(options, function(respTarget){
		var risposta = '';
		respTarget.on('data', function (chunk) { risposta += chunk; });
		respTarget.on('end', function () {
			
			var readValue = JSON.parse(risposta).measuredVal;
			callback(readValue);
		});
	}).end();
};





function test() {
  console.log("TIMEOUT");
}


var produceValueToTarget = function(smartObjects, value, callback){
	var risposte = [];
	var receivedResp = 0;
	
	for(var i in smartObjects){
		var obj = smartObjects[i];
						
		var options = produceHttpOptions(obj.url, "POST");
		if(obj.effectOnFOI.length == 1) options.path += "?value=MAX";
		else options.path += "?value=" + value;
		
		reqToTarget(options, smartObjects[i].guid, function(risposta){
			risposte.push(risposta);
			receivedResp++;
			if(receivedResp == smartObjects.length){
				callback(JSON.stringify(risposte));
			}
		});
	}
}


var setOnSmartObjects = function(smartObjects, res){
	var risposte = [];
	var receivedResp = 0;
	
	for(var i in smartObjects){
		var obj = smartObjects[i];
		
		var options = produceHttpOptions(obj.url, "PUT");
		
		reqToTarget(options, smartObjects[i].guid, function(risposta){
			risposte.push(risposta);
			receivedResp++;
			if(receivedResp == smartObjects.length){
				res.statusCode = 200;
				res.send(JSON.stringify(risposte));
			}
		});
	}
}


var setConceptValue = function(sign, smartObjects, res){
	//Set Hot foi:Temperature
	//smartObjects sono tutti gli oggetti capaci di generare la feature.
	
	var risposte = [];
	var receivedResp = 0;
	
	for(var i in smartObjects){
		var obj = smartObjects[i];
		
		var options = produceHttpOptions(obj.url, "POST");
		if(obj.effectOnFOI.length == 1) options.path += "?value=MAX";
		else {
			if(sign == ">") options.path += "?value=MAX";
			if(sign == "<") options.path += "?value=MIN";
		}
		
		reqToTarget(options, smartObjects[i].guid, function(risposta){
			risposte.push(risposta);
			receivedResp++;
			if(receivedResp == smartObjects.length){
				res.statusCode = 200;
				res.send(JSON.stringify(risposte));
			}
		});
	}
}

var reqToTarget = function(options, guid, callback){
	var reqTarget = http.request(options, function(respTarget){
		var risposta = '';
		respTarget.on('data', function (chunk) { risposta += chunk; });
		respTarget.on('end', function () {			
			try {
				var resp = JSON.parse(risposta);
				var respToClient = new ResponseToClient();
				respToClient.switch = resp.switch;
				respToClient.measuredVal = resp.measuredVal;
				respToClient.settedVal = resp.settedVal;
				respToClient.guid = guid;
				callback(respToClient);
			} catch (e) {
				callback(resp);
			}
		});
	}).end();
}

var produceHttpOptions = function(url, method){

	var splitted = url.split(":"); //   http - //localhost - 3003/MySmartTV2
	
	var hostname = splitted[1].replace('//', '');
	
	splitted = splitted[2].split("/");
	
	var port = splitted[0];
	var path = "/" + splitted[1];
			
	var options = {
		hostname: hostname,
		method: method,
		port: port,
		path: path
	};
	
	return options;
}

var selectGenerated = function(symbol, objects){
	var obj = [];

	for(var i in objects){
		var ob = objects[i];

		for(var j in ob.effectOnFOI){
			var effect = ob.effectOnFOI[j];

			if(effect == symbol){
				obj.push(ob);
				//break;
			}
		}
	}
	return obj;
}



