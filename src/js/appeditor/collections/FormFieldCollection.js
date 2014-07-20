var FormFieldModel = require('../models/FormFieldModel');


    var FormFieldCollection = Backbone.Collection.extend({
      model: FormFieldModel
    });

    exports.FormFieldCollection = FormFieldCollection;