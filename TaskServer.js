var util = require("util");
var redis = require("redis");
var config = require("./config.js");
var events = require("events");
var uuid = require('node-uuid');
var exec = require('child_process').exec;

var refreshTime = 10000; //rate at which to check queue for tasks after all tasks are done

var taskManager = new events.EventEmitter();
var client;
taskManager.on("runPendingTasks", function(){
	console.log("Running pending tasks...");
	client.lpop("queue_tasks", function(err,reply){
		if(reply){
			//we have a reply
			if(reply.length > 0){
				 executeNextTask(reply);
			}else{
				console.log ("No pending task.");
			}
		}else if(err){
			console.log("An error has occurred when retrieving the next task in queue: "+err);
		}else{
			console.log("No more task to execute.");
		}
	});
});

client = redis.createClient(config.redis_port, config.redis_host);

client.on("error", function(err){
	console.log("Error: "+err);
});

client.on("ready", function(){
	console.log("TaskServer is ready to speak with Redis.");
	/*
	Load queue, call execution of tasks
	*/
	taskManager.emit("runPendingTasks");
	/*
	Launch communication manager to talk to user
	*/
	CommunicationManager();
});


/*
Fork child process, do not pass any parameter, execute task and return output
*/
var executeNextTask = function(executionParameters){
	console.log("Executing -> "+executionParameters);
	var executionResults = "Task completed without output.";

	exec(executionParameters,{timeout:2000},
	function (error, stdout, stderr) {
		var date = new Date();
		var current_hour = date.getHours();
		var current_minute = date.getMinutes();
		var current_second = date.getSeconds();
		var current_milli = date.getMilliseconds();
		if (error !== null) {
			executionResults = error;
		}else if(stderr!=""){
			executionResults = stderr;	
		}else if(stdout!=""){
			executionResults = stdout;
		}
		console.log(current_hour+":"+current_minute+":"+current_second+":"+current_milli+":"+"log: "+executionResults);
		taskManager.emit("runPendingTasks");
	});
	return executionResults;
};


var CommunicationManager = function(){
	console.log("Waiting for user to connect...");
	//constructor to start web server
	this.app = require('http').createServer();
	this.app.listen(config.task_server_port);
	this.io = require('socket.io')(this.app);
	
	this.io.on('connection', function(socket){
		console.log("User has connected. Waiting for commands.");
		socket.on('fetch_list', function(data){
			client.keys("*",function(err,reply){
				console.log(reply);
			});
			client.lrange(["uuidlist",0,-1], function(err,reply){
				console.log("lrange"+reply);
			});
		});
		socket.on('getTaskList',function(data){
			client.lrange(["queue_tasks",0,-1], function(err,reply){
				if(reply){
					//we have a reply
					console.log("Queue of tasks: "+reply);
					//TODO: format better response
					socket.emit("queue_tasks", {queue_tasks:JSON.stringify(reply)} );
				}else if(err){
					console.log("An error has occurred when retrieving Queue of tasks: "+err);
				}else{
					console.log("WARN: Queue of tasks not found in DB.");
				}
				console.log(reply);
			});
		});
		socket.on('pushTask',function(data){
			client.rpush("queue_tasks",data);
		});
	});
};
setTimeout(function(){
	taskManager.emit("runPendingTasks")
	}, refreshTime);




