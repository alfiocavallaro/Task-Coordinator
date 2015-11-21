// Load required packages
var mongoose = require('mongoose');

// Define our beer schema
var GoalSchema = new mongoose.Schema({
  trigger: String,
  action: String,
  value: String,
  target: String,
  room: String
});

// Export the Mongoose model
module.exports = mongoose.model('Goal', GoalSchema);