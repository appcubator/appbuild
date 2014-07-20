var ActionModel = require('../models/ActionModel');

  var ActionCollection = Backbone.Collection.extend({
    model: ActionModel
  });

  exports.ActionCollection = ActionCollection;
