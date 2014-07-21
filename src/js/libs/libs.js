window.jQuery = require('./node_modules/jquery/dist/jquery');
window.$ = window.jQuery;
require('./jquery.hotkeys');
require('./node_modules/jquery-ui-browserify/dist/jquery-ui');
// Prettycheckable

window._ = require('./node_modules/underscore/underscore');
window.Backbone = require('./node_modules/backbone/backbone');
require('./BackboneRegrettable');

require('./util/util');
require('./util/util.path');
