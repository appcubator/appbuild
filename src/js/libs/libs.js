window.jQuery = require('./node_modules/jquery/dist/jquery');
window.$ = window.jQuery;
require('./node_modules/jquery-ui/jquery-ui');
require('./jquery.hotkeys');
require("./jquery.scrollbar");
require('./fontselect/jquery.fontselect.js');

require('./shortcut');
require('./jquery.freshereditor');

require('./bootstrap/bootstrap.min');
require('./bootstrap/bootstrap-dropdown');

require('./ace');
// we use this to compile the app's css on the frontend
require('./less-1.7.4.min');

window._ = require('./node_modules/underscore/underscore');
window.Backbone = require('./node_modules/backbone/backbone');
Backbone.$ = $;
require('./BackboneRegrettable');
require('../appeditor/mixins/BackboneConvenience');
require('../appeditor/mixins/BackboneUI');
require('../appeditor/mixins/BackboneCardView');
require('../appeditor/mixins/BackboneDropdownView');

require('./util/util');
require('./util/util.path');
