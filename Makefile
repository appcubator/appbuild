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
	npm install --prefix ./src/js/libs/
	# rm ./src/js/libs.js
	./node_modules/browserify/bin/cmd.js ./src/js/libs/libs.js >> ./dist/js/libs.js
	#cp ./src/js/libs.js ./dist/js/libs.js

	# build appeditor
	# rm ./src/js/appbuild.js
	./node_modules/browserify/bin/cmd.js ./src/js/appeditor/main.js >> ./dist/js/appbuild.js
	# cp ./src/js/appbuild.js ./dist/js/appbuild.js

	# build iframe-appeditor
	# rm ./src/js/appbuild.js
	./node_modules/browserify/bin/cmd.js ./src/js/appeditor/iframe-main.js >> ./dist/js/iframe-appbuild.js
	# cp ./src/js/appbuild.js ./dist/js/appbuild.js


	# build appmake
	cp ./src/js/expander.js ./dist/js/expander.js

	# HTML
	cp ./src/index.html ./dist/index.html

	# CSS
	cp -rf ./src/css/ ./dist/css/
	cp ./src/temp.css ./dist/temp.css
	# Images
	cp -rf ./src/img/ ./dist/img/

	./node_modules/less/bin/lessc --verbose --rootpath=/static/css/app/ -x --yui-compress --ru --line-numbers=mediaquery ./src/css/app/app.less ./dist/css/app/app.css
	echo "[BUILD] Compiled app/app.less to app.css"
	./node_modules/less/bin/lessc --verbose --rootpath=/static/css/app/ -x --yui-compress --ru --line-numbers=mediaquery ./src/css/internal.less ./dist/css/internal.css
	echo "[BUILD] Compiled app/internal.less to internal.css"

	rm -rf ./dist/css/*.less

	# HTML
	cp ./src/index.html ./dist/index.html
	cp ./src/iframe-editor.html ./dist/iframe-editor.html
	# TODO: build appcubator-plugin


buildw:
	node scripts/watch.js ./src/ make build

# test:
# 	make
# 	mkdir -p test/lib

clean:
	rm -rf dist/*

lint:
	./node_modules/coffeelint/bin/coffeelint -f lint.config.json -r src

# dist:

.PHONY: build clean lint test

