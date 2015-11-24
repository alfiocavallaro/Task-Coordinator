var http = require('http');
var QueryGenerator = require('./queryGenerator');
var GoalCtrl = require('./goalCtrl');
var syncRequest = require('sync-request');
var Goal = require('../models/goal');

exports.newGoal = function(res,action,trigger,elseAction,repeat){
	elaborateGoal(res,action,trigger,elseAction,repeat);
};

//Punto di Start. Richiedo l'elaborazione di un goal.
var elaborateGoal = function(res,action,trigger,elseAction,repeat){
	if(trigger){
		var isFired = evaluateTrigger(trigger);
		if(isFired == true){
			console.log("isFired: " + trigger + " " + action + " " + elseAction + " " + repeat);
			if(repeat.toLowerCase() == "yes") saveInMongoDB(action,trigger,elseAction,repeat);
			requestToSmartObjects(action, res);
		}else if(isFired == false){
			if(elseAction){
				if(repeat.toLowerCase() == "yes") saveInMongoDB(action,trigger,elseAction,repeat);
				requestToSmartObjects(elseAction, res);
			}else{
				saveInMongoDB(action,trigger,elseAction,repeat);
				if(res) res.send("Trigger saved in DB.");
			}
		}else{
			if(res) res.send(isFired);
			return;
		}
	}else{
		if(action.objects.length == 0 && res) res.send("La ricerca non ha restituito risultati");
		else requestToSmartObjects(action, res);
	}
};

var saveInMongoDB = function(action,trigger,elseAction,repeat){
	
	var gl = new Goal();
	gl.trigger = JSON.stringify(trigger);
	gl.action = JSON.stringify(action);
	gl.elseAction = JSON.stringify(elseAction);
	gl.repeat = repeat;
	
	gl.save(function (err) {
        if (err) { 
            console.log(err);
        }
        else {
            console.log("Trigger saved in DB.");
        }
    });
};

//Return TRUE if trigger is fired, else FALSE
var evaluateTrigger = function(trigger){
	if(trigger.subject.toLowerCase() == "time"){
		return evaluateTimeTrigger(trigger);
	}else{
		var res = syncRequest('GET', trigger.objects[0].url);
		var resp = JSON.parse(res.body.toString('utf-8'));
		return evaluateObjectTrigger(trigger,resp);
	}
}

var evaluateObjectTrigger = function(trigger,status){
	if(isNaN(trigger.object)){ //stringa
		if(trigger.object.toLowerCase() == "on" || trigger.object.toLowerCase() == "off")
			if(trigger.object.toLowerCase() == status.switch) return true;
			else return false;
		else return "trigger: " + trigger.object + " not valid";
	}else{ //numero
		if(trigger.sign == "=" || trigger.sign == "=="){
			if(trigger.object == status.measuredVal) return true;
			else return false;
		}else if(trigger.sign == "<=" || trigger.sign == "<"){
			if(status.measuredVal < trigger.object || status.measuredVal < trigger.object) return true;
			else return false;
		}else if(trigger.sign == ">=" || trigger.sign == ">"){
			if(status.measuredVal >= trigger.object || status.measuredVal > trigger.object) return true;
			else return false;
		}else{
			return false;
		}
	}
}


var evaluateTimeTrigger = function(trigger){	
	var now = new Date();
	var sign = trigger.sign;
		
	if(trigger.startTime && trigger.endTime){
		if(sign == "==" || sign == "="){
			if( (now.getHours() > trigger.startTime.hour && now.getHours < trigger.endTime.hour) ||
			(now.getHours() == trigger.startTime.hour && now.getMinutes() > trigger.startTime.min) ||
			(now.getHours() == trigger.endTime.hour && now.getMinutes() < trigger.endTime.min)){
				return true;
			} else {
				return false;
			}
		}else if(sign == "!=" || sign == "=!"){
			if( (now.getHours() < trigger.startTime.hour) || (now.getHours() > trigger.endTime.hour) ||
						((now.getHours() == trigger.startTime.hour) && (now.getMinutes() < trigger.startTime.min)) ||
						((now.getHours() == trigger.endTime.hour) && (now.getMinutes() > trigger.startTime.min)) ){
							return true;
			}else return false;
		}else{
			console.log("Error: " + sign + " is not valid for time interval");
			return "Error: " + sign + " is not valid for time interval";
		} 
	}else if(trigger.startTime){
		if(sign == "<" || sign == "<=" || sign == "=<"){
			if((now.getHours() < trigger.startTime.hour) || (now.getHours() == trigger.startTime.hour && now.getMinutes() <= trigger.startTime.min))
				return true;
			else return false;
		}else if(sign == ">" || sign == ">=" || sign == "=>"){
			if((now.getHours() > trigger.startTime.hour) || (now.getHours() == trigger.startTime.hour && now.getMinutes() >= trigger.startTime.min))
				return true;
			else return false;
		}else return "Error: " + sign + " is not valid for single time";
	}else{
		return "trigger not valid";
	}
};


var requestToSmartObjects = function(action, res){
	
	var target = action.target;
	var smartObjects = action.objects;
	var splitted = target.split(":");
	console.log("Request: " + action.command + " " + action.value + " " + action.target);
	
	if(splitted.length == 1 || action.command.toLowerCase() == "get"){ //Object
		setRequestToTarget(action, smartObjects, res);
	}else if(splitted.length == 2){ //Feature
		sequenceOfTask(action, smartObjects, res);
	}
}


var setRequestToTarget = function(request, smartObjects, res){
	var risposte = [];
	var receivedResp = 0;
	
	for(var i in smartObjects){
		var smartObject = smartObjects[i];
		
		var options = elaborateRequest(smartObject, request);
		if(options == null){
			if(res) res.send("Richiesta non valida. Impossibile invocare il metodo sull'oggetto specificato");
			return;
		}

		var reqTarget = http.request(options, function(respTarget){
			var risposta = '';
			respTarget.on('data', function (chunk) { risposta += chunk; });
			respTarget.on('end', function () {
				try {
					var resp = JSON.parse(risposta);
					var respToClient = new ResponseToClient(resp.switch,resp.measuredVal,resp.settedVal,smartObjects[receivedResp].guid);
					risposte.push(respToClient);
				} catch (e) {
					risposte.push(risposta);
				}
				receivedResp++;					
				if(receivedResp == smartObjects.length && res) res.send(JSON.stringify(risposte));
			});
		}).end();
	}
};

var elaborateRequest = function(smartObject, request){
	//GET - PUT - DELETE - POST ?value=valore
	var value = request.value; //ON - OFF - 5 - 15°C - Cold - Hot
	
	if(!value && request.command.toLowerCase() == "get") var method = "GET";
	else if(value.toLowerCase() == "on") var method = "PUT";
	else if(value.toLowerCase() == "off") var method = "DELETE";
	else var method = "POST";

	if(!hasMethod(smartObject, method))	return null;
	
	var options = produceHttpOptions(smartObject.url,method);
	if(method == "POST"){
		options.path += '?value=' + value;
	} 

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
		if(mth == objMethod) return true;
	}
	return false;
}


var sequenceOfTask = function(request, smartObjects, res){
	
	var command = request.command;
	var value = request.value;
	var target = request.target;
	var room = request.room;
	
	if(!isNaN(parseInt(value))){ //value è un numero. L'azione dipende dal valore misurato
		setNumericValue(value, target, room, smartObjects, res);
	}else{//Value è qualcosa come HOT - COLD. 
		var query = QueryGenerator.effectOnFOI(value); //dbpedia:Hot foi:effectOnFOI ">"
		discoveryBlockQuery(query, function(response){
			var ob = JSON.parse( response );
			if(ob.length > 0){
				var sign = ob[0].object.replace(/"/, '').replace(/"/, '');
				setConceptValue(sign, smartObjects, res); //Es. Temperature
			}else{
				setOnSmartObjects(smartObjects, res); //Es. Entertainment
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
			if(res) res.send("La ricerca non ha restituito risultati");
			return;
		} 
			
		var options = produceHttpOptions(Objects[0].url, "GET");
		readTarget(options, function(readValue){

			if(readValue > value) var ob = selectGenerated("<", smartObjects);
			else if(readValue < value) var ob = selectGenerated(">", smartObjects);
			else{ //readValue raggiunto. non devo fare null.
				if(res) res.send("Target raggiunto");
				return;
			}
			
			produceValueToTarget(ob, value, function(risp){
				res.statusCode = 200;
				if(res) res.send(risp);
			});
		});
	});
}


var readTarget = function(options, callback){
	var reqTarget = http.request(options, function(respTarget){
		var risposta = '';
		respTarget.on('data', function (chunk) { risposta += chunk; });
		respTarget.on('end', function () {
			callback(JSON.parse(risposta).measuredVal);
		});
	}).end();
};


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
			if(receivedResp == smartObjects.length)
				callback(JSON.stringify(risposte));
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
			if(receivedResp == smartObjects.length && res) res.send(JSON.stringify(risposte));
		});
	}
}


var setConceptValue = function(sign, smartObjects, res){
	//Set Hot foi:Temperature
	
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
			if(receivedResp == smartObjects.length && res) res.send(JSON.stringify(risposte));
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
				var respToClient = new ResponseToClient(resp.switch,resp.measuredVal,resp.settedVal,guid);
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
			}
		}
	}
	return obj;
}

function ResponseToClient(_switch,measuredVal,settedVal,guid) {
	this.switch = _switch;
	this.measuredVal = measuredVal;
	this.settedVal = settedVal;
	this.guid = guid;
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

var interval = setInterval(periodicFunction, 10000);

function periodicFunction() {
	Goal.find(function(err, goals){
		if(goals.length > 0){
			var trigger = JSON.parse(goals[0].trigger);
			var action = JSON.parse(goals[0].action);
			if(goals[0].elseAction) var elseAction = JSON.parse(goals[0].elseAction);
			var repeat = goals[0].repeat;

			goals[0].remove();
			
			elaborateGoal(undefined, action, trigger, elseAction, repeat);
			
		}
	});
}
