// Get the packages we need
var express = require('express');
var mongoose = require('mongoose');
var bodyParser = require('body-parser');
var goalController = require('./controllers/goalCtrl');
var Goal = require('./models/goal');

// Connect to the beerlocker MongoDB
mongoose.connect('mongodb://localhost:27017/taskcoordinator');

// Create our Express application
var app = express(); 

// Set view engine to ejs
app.set('view engine', 'ejs');

// Use the body-parser package in our application
app.use(bodyParser.urlencoded({
  extended: true
}));

// Use environment defined port or 3000
var port = process.env.PORT || 3001;

/* Define route */
// Create our Express router
var router = express.Router();

// Create endpoint handlers for /goals
router.route('/goals')
  .post(goalController.postGoals)
  .get(goalController.getGoals)
  .delete(goalController.deleteGoals);

// Create endpoint handlers for /goals/:goal_id
router.route('/goals/:goal_id')
  .get(goalController.getGoal)
  .delete(goalController.deleteGoal);
/* END Define route */
  
// Register all our routes with /api
app.use('/', router);

// Start the server
app.listen(port);
console.log('Task Coordinator on port ' + port);