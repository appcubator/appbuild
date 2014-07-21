var FormFieldModel = require('../models/FormFieldModel').FormFieldModel;


    var FormFieldCollection = Backbone.Collection.extend({
      model: FormFieldModel
    });

    exports.FormFieldCollection = FormFieldCollection;