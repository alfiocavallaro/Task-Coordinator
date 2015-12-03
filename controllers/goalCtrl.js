var mongoose = require('mongoose');
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

var receive = function(req, callback){
	var body = '';
	req.on('data', function(data){
		body += data;
	});
	req.on('end', function(){
		callback(body);
	});
};

var writeRequestFile = function(stream){
	var time = new Date().toISOString().replace(/\..+/, '').replace(/:/, '-').replace(/:/, '-');     
	var file = './requests/prova.json' + time + '.json';
	
	fs.writeFile(file, stream, function (err) {
		console.log('File: ' + file +' scritto con successo');
	});
}


//Punto di Partenza! Ricevo un goal da gestire.
//Salvo il file di richiesta JSON su disco ed elaboro il goal
exports.postGoals = function(req, res){
	receive(req, function(body){
		writeRequestFile(body);
		elaborateGoal(res, body);
	});
};


//Funzione che ottiene target e room, e da questo genera
//la query che verrà inviata al discoveryBlock. Alla ricezione della risposta
//chiamo la callback per analizzare la risposta. Dalla risposta prendo l'url dei target
//al quale farò una request e rimando al mittente la risposta.
var elaborateGoal = function(res, body){

	var request = JSON.parse( body );
	var action = request.action;
	var trigger = request.trigger;
	var elseAction = request.elseAction;
	
	var wait = 1;
	if(trigger){
		if(trigger.subject.toLowerCase() !== "time") wait++;
	}
	if(elseAction) wait++;
	
	var receivedResp = 0;
	
	var queryAction = QueryGenerator.generateQuery(action);
	discoveryBlockQuery(queryAction, function(response){
		action.objects = analyzeDiscoveryBlockResponse(response);
		receivedResp++;
		if(receivedResp == wait) 
			validateGoal(res,action,trigger,elseAction,request.repeat);
	});
	
	if(trigger){
		if(trigger.subject.toLowerCase() !== "time"){
			var queryTrigger = QueryGenerator.generateQuery(trigger);
			discoveryBlockQuery(queryTrigger, function(response){
				trigger.objects = analyzeDiscoveryBlockResponse(response);
				receivedResp++;
				if(receivedResp == wait) 
					validateGoal(res,action,trigger,elseAction,request.repeat);
			});
		}
	}
	
	if(elseAction){
		var queryElse = QueryGenerator.generateQuery(elseAction);
		discoveryBlockQuery(queryElse, function(response){
			elseAction.objects = analyzeDiscoveryBlockResponse(response);
			receivedResp++;
			if(receivedResp == wait) 
				validateGoal(res,action,trigger,elseAction,request.repeat);
		});
	}
};

var validateGoal = function(res,action,trigger,elseAction,repeat){
	
	if(action){
		if(action.objects.length == 0){
			res.send("Action Objects is empty");
			return;
		} 
	}else{
		res.send("Action cannot be empty");
		return;
	}
	
	if(elseAction){
		if(elseAction.objects.length == 0){
			res.send("elseAction Objects is empty");
			return;
		} 
	}
	
	if(trigger){
		if(trigger.subject.toLowerCase() !== "time" && trigger.objects.length == 0){
			res.send("trigger Objects is empty");
			return;
		}else parseTime(trigger, res);
	}
	
	Coordinator.newGoal(res,action,trigger,elseAction,repeat);
}

var parseTime = function(trigger, res){
	var elem = trigger.object.replace("[", '').replace("]", '').split("-");
		
	var time = elem[0].split(":");
	var start = new Object();
	start.hour = parseInt(time[0]);
	start.min = parseInt(time[1]);
	
	if(elem.length == 2){
		time = elem[1].split(":");
		var end = new Object();
		end.hour = parseInt(time[0]);
		end.min = parseInt(time[1]);
		
		if(start.hour > end.hour){
			//res.send("Time Trigger Not Valid");
			return;
		}else if(start.hour == end.hour){
			if(start.min >= end.min){
				//res.send("Time Trigger Not Valid");
				return;
			}
		}
		
	}else if(elem.length > 2){
		//res.send("Time Trigger Not Valid");
		return;
	}
	
	trigger.startTime = start;
	trigger.endTime = end;
}

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
		smartObjects.push(smartObject);
	}
	return smartObjects;
};

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

exports.getGoals = function(req, res) {
	Goal.find(function(err, goals){
		if(err){return next(err);}
		res.json(goals)
	})
};

exports.deleteGoals = function(req, res){
	var gl = new Goal();
    gl.collection.drop(function (err) { 
		res.send("Collection Dropped!");
	});
};

exports.getGoal = function(req, res) {
    Goal.findById({ _id: req.params.goal_id }, function(err, goal) {
    if (err)
      res.send(err);

    res.json(goal);
  });
};

exports.deleteGoal = function(req, res) {
	Goal.findById({ _id: req.params.goal_id }, function(err, goal) {
		if (err)
			res.send(err);

		goal.remove();
		res.send("Dropped");
    });
};