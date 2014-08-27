window.jQuery = require('./node_modules/jquery/dist/jquery');
window.$ = window.jQuery;
require('./node_modules/jquery-ui/jquery-ui');
require('./jquery.hotkeys');
require("./jquery.scrollbar");

require('./shortcut');
require('./jquery.freshereditor');

require('./ace');

window._ = require('./node_modules/underscore/underscore');
window.Backbone = require('./node_modules/backbone/backbone');
Backbone.$ = $;
require('./BackboneRegrettable');
require('../appeditor/mixins/BackboneConvenience');
require('../appeditor/mixins/BackboneUI');

require('./util/util');
require('./util/util.path');
