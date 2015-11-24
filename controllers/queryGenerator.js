var validator = new RegExp("^[a-z0-9]{8}-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{12}$", "i");

var prefix = "@prefix : <http://example.org/smartobject#>.\n"
	+ "@prefix dbpedia: <http://dbpedia.org/resource/>.\n"
	+ "@prefix foi: <http://www.featureOfInterest.org/example#>.\n"
	+ "@prefix http: <http://www.w3.org/2011/http#>.\n \n";
	
var endQuery = " ?subject ?anyP ?anyOb }\n"
	+ "=>\n"
	+ "{ ?subject ?anyP ?anyOb. }.";
	
exports.generateQuery = function(request){
	
	var command = request.command;
	
	//Action or ElseAction
	if(command){
		var value = request.value;
		var target = request.target;
		var room = request.room;
	}else{ //Trigger
		var target = request.subject;
		var room = request.room;
		command = "get";
	}
	
	var splitted = target.split(":");
	if(splitted.length == 1){
		//GET SmartTV - GET FF77833D-8E52-460D-835D-29ABD1AD7DF9
		query = queryToObject(target, room);
	}else if(splitted.length == 2){
		//GET foi:Temperature
		query = queryToFOI(command, splitted[1], room, value);
	}
	
	return query;
}

var queryToFOI = function(command, target, room, value){
	//foi:hasFOI dbpedia:Temperature;
	
	if(command.toLowerCase() == "get"){
		var query = queryFOIMeasurated(target, room);
	}else if(command.toLowerCase() == "set"){
		var query = queryFOIGenerated(target, room, value);
	}

	return query;
}

var queryFOIMeasurated = function(target, room){
	var query = "";
	
	query = prefix + "{ ?subject :isA	?any.\n";
	query += " ?subject foi:hasFOI dbpedia:" + target + ".\n";
	query += " ?subject foi:FOIMisurated dbpedia:" + target + ".\n";
	if(room) query += " ?subject :isIn :" + room + ".\n";
	query += endQuery;
	
	return query;
}

exports.measureFOI = function(target, room){
	var query = queryFOIMeasurated(target, room);
	return query;
};

var queryFOIGenerated = function(target, room, value){
	var query = "";
	
	query = prefix + "{ ?subject :isA	?any.\n";
	query += " ?subject foi:hasFOI dbpedia:" + target + ".\n";
	if(room) query += " ?subject :isIn :" + room + ".\n";
	if(value){
		if(isNaN(parseInt(value)) && value.toLowerCase() != "on" && value.toLowerCase() != "off") query += " ?subject foi:FOIGenerated dbpedia:" + value + ".\n";
	} 
	query += endQuery;
	
	return query;
}


exports.effectOnFOI = function(feature){
	var query = prefix;
	query += "{dbpedia:" + feature + " foi:effectOnFOI ?anyP }\n"
	+ "=>\n"
	+ "{dbpedia:" + feature + " foi:effectOnFOI ?anyP }.";
	return query;
	
}


var queryToObject = function(target, room){
	var query = "";
	
	//if target isGuid
	if(validator.test(target.toString())){
		
		query = prefix + "{ ?subject :hasGuid '" + target + "'.\n";
		query += endQuery;

	}else{ //Se non è un GUID, considero Target e Room
	
		query = prefix + "{ ?subject :isA :" + target + ".\n";
		if(room) query += " ?subject :isIn :" + room + ".\n";
		query += endQuery;

	}
	
	return query;
}


var queryAll = function(){
	
	var query = prefix + "{ ?subject :isA ?any.\n";
	query += endQuery;
	
	return query;
}