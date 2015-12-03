# Task-Coordinator

This project proposes a goal-oriented platform able to perform a set of task necessary to achieve the request expressed by user.

The proposed scenario is constituted by an intelligent environment in which they are immersed several smart objects.

This platform is a middleware between user and smart object. Users express their request in form of goal. The platform understand the request and coordinates the action of smart object.

The platform is made of serveral parts: Undertanding Block, Task Coordinator, Discovery Block, Target Block, SmartHome-Application-Client.

This module receive request from Understing Block. From this request a query in N3 format is produced and are sended to Discovery Block. Discovery Block returns a set of object that satisfies the query. Task Coordinator produce a set of task that are sended to Target Block.

It requires Node.js and Mongo DB installed. 
Install the system with command npm install. 
Start Discovery Block and Target Block.
