all: build

build:
	#make lint
	make clean
	mkdir -p dist
	mkdir -p dist/js
	mkdir -p dist/css
	mkdir -p dist/font
	mkdir -p dist/img

	# build vendors
	# ./node_modules/browserify/bin/cmd.js vendors/vendors.coffee >> public/js/vendors.js
	# build appeditor
	# ./node_modules/browserify/bin/cmd.js src/main.coffee >> public/js/jsonbrowser.js
	# build website
	# ./node_modules/browserify/bin/cmd.js src/main.coffee >> public/js/jsonbrowser.js


	# CSS
	cp -rf ./src/css/ ./dist/css/

	./node_modules/less/bin/lessc --verbose --rootpath=/static/css/app/ -x --yui-compress --ru --line-numbers=mediaquery ./src/css/app/app.less ./dist/css/app/app.css
	echo "[BUILD] Compiled app/app.less to app.css"
	./node_modules/less/bin/lessc --verbose --rootpath=/static/css/app/ -x --yui-compress --ru --line-numbers=mediaquery ./src/css/internal.less ./dist/css/internal.css
	echo "[BUILD] Compiled app/internal.less to internal.css"

	rm -rf ./dist/css/*.less

	# HTML
	cp ./src/index.html ./dist/index.html
	# TODO: build appcubator-plugin

	# compile less

buildw:
	./node_modules/coffee-script/bin/coffee scripts/watch.coffee . make build

# test:
# 	make
# 	mkdir -p test/lib

clean:
	rm -rf dist/*

lint:
	./node_modules/coffeelint/bin/coffeelint -f lint.config.json -r src

# dist:

.PHONY: build clean lint test

