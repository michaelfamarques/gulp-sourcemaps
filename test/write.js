'use strict';

var yargs = require('yargs').argv;
var test = require('tape');
var sourcemaps = require('..');
var File = require('vinyl');
var ReadableStream = require('stream').Readable;
var path = require('path');
var fs = require('fs');
var hookStd = require('hook-std');
var debug = require('debug-fabulous')();
var miss = require('mississippi');

var from = miss.from;
var pipe = miss.pipe;
var concat = miss.concat;

if (!yargs.ignoreLogTests){
  debug.save('gulp-sourcemaps:*');
  debug.enable(debug.load());
}
var assign = require('object-assign');
var utils = require('../src/utils');
var convert =  require('convert-source-map');

var sourceContent = fs.readFileSync(path.join(__dirname, 'assets/helloworld.js')).toString();
var mappedContent = fs.readFileSync(path.join(__dirname, 'assets/helloworld.map.js')).toString();

function makeSourceMap(custom) {
  var obj = {
    version: 3,
    file: 'helloworld.js',
    names: [],
    mappings: '',
    sources: ['helloworld.js'],
    sourcesContent: [sourceContent]
  };

  if (custom)
    assign(obj,custom);

  return obj;
}

function base64JSON(object) {
  return 'data:application/json;charset=utf8;base64,' + new Buffer(JSON.stringify(object)).toString('base64');
}

function makeFile(custom) {
  var file = new File({
    cwd: __dirname,
    base: path.join(__dirname, 'assets'),
    path: path.join(__dirname, 'assets', 'helloworld.js'),
    contents: new Buffer(sourceContent)
  });
  file.sourceMap = makeSourceMap(custom);
  return file;
}

function makeMappedFile() {
  var file = new File({
    cwd: __dirname,
    base: path.join(__dirname, 'assets'),
    path: path.join(__dirname, 'assets', 'helloworld.map.js'),
    contents: new Buffer(mappedContent)
  });
  file.sourceMap = makeSourceMap({preExistingComment:utils.getInlinePreExisting(mappedContent)});
  return file;
}

function makeNestedFile() {
  var file = new File({
    cwd: __dirname,
    base: path.join(__dirname, 'assets'),
    path: path.join(__dirname, 'assets', 'dir1', 'dir2', 'helloworld.js'),
    contents: new Buffer(sourceContent)
  });
  file.sourceMap = makeSourceMap();
  return file;
}

function makeStreamFile() {
  var file = new File({
    cwd: __dirname,
    base: path.join(__dirname, 'assets'),
    path: path.join(__dirname, 'assets', 'helloworld.js'),
    contents: new ReadableStream()
  });
  file.sourceMap = {};
  return file;
}

test('write: should pass through when file is null', function(t) {
  var file = new File();
  var pipeline = sourcemaps.write();
  pipeline.on('data', function(data) {
    t.ok(data, 'should pass something through');
    t.ok(data instanceof File, 'should pass a vinyl file through');
    t.deepEqual(data, file, 'should not change file');
    t.equal(data.contents, null, 'should not change file content');
    t.end();
  }).on('error', function() {
    t.fail('emitted error');
    t.end();
  }).write(file);
});

test('write: should pass through when file has no source map', function(t) {
  var file = makeFile();
  delete file.sourceMap;
  var pipeline = sourcemaps.write();
  pipeline.on('data', function(data) {
    t.ok(data, 'should pass something through');
    t.ok(data instanceof File, 'should pass a vinyl file through');
    t.deepEqual(data, file, 'should not change file');
    t.equal(String(data.contents), sourceContent, 'should not change file content');
    t.end();
  }).on('error', function() {
    t.fail('emitted error');
    t.end();
  }).write(file);
});

test('write: should emit an error if file content is a stream', function(t) {
  var pipeline = sourcemaps.write();
  pipeline.on('data', function() {
    t.fail('should emit an error');
    t.end();
  }).on('error', function() {
    t.ok('should emit an error');
    t.end();
  }).write(makeStreamFile());
});

test('write: should write an inline source map', function(t) {
  var file = makeFile();
  var pipeline = sourcemaps.write();
  pipeline.on('data', function(data) {
    t.ok(data, 'should pass something through');
    t.ok(data instanceof File, 'should pass a vinyl file through');
    t.deepEqual(data, file, 'should not change file');
    t.equal(String(data.contents), sourceContent + '\n//# sourceMappingURL=' + base64JSON(data.sourceMap) + '\n', 'should add source map as comment');
    t.end();
  }).on('error', function() {
    t.fail('emitted error');
    t.end();
  }).write(file);
});

test('write: should use CSS comments if CSS file', function(t) {
  var file = makeFile();
  file.path = file.path.replace('.js', '.css');
  var pipeline = sourcemaps.write();
  pipeline.on('data', function(data) {
    t.equal(String(data.contents), sourceContent + '\n/*# sourceMappingURL=' + base64JSON(data.sourceMap) + ' */\n', 'should add source map with CSS comment');
    t.end();
  }).write(file);
});

test('write: should write no comment if not JS or CSS file', function(t) {
  var file = makeFile();
  file.path = file.path.replace('.js', '.txt');
  var pipeline = sourcemaps.write();
  pipeline.on('data', function(data) {
    t.equal(String(data.contents), sourceContent);
    t.end();
  }).write(file);
});

test('write: should detect whether a file uses \\n or \\r\\n and follow the existing style', function(t) {
  var file = makeFile();
  file.contents = new Buffer(file.contents.toString().replace(/\n/g, '\r\n'));
  var pipeline = sourcemaps.write();
  pipeline.on('data', function(data) {
    t.ok(data, 'should pass something through');
    t.equal(String(data.contents), sourceContent.replace(/\n/g, '\r\n') + '\r\n//# sourceMappingURL=' + base64JSON(data.sourceMap) + '\r\n', 'should add source map as comment');
    t.end();
  }).on('error', function() {
    t.fail('emitted error');
    t.end();
  }).write(file);
});

test('write: preExistingComment', function(t) {
  var file = makeMappedFile();
  file.contents = new Buffer(convert.removeComments(file.contents.toString()));

  sourcemaps.write({preExistingComment:true})
  .on('data', function(data) {
    t.ok(data, 'should pass something through');
    t.ok(!!data.sourceMap.preExistingComment, 'should mark as preExistingComment');
    t.equal(
      String(data.contents),
      sourceContent + '\n//# sourceMappingURL=' + base64JSON(data.sourceMap) + '\n' ,'should add source map as comment');
    t.end();
  })
  .on('error', function() {
    t.fail('emitted error');
    t.end();
  })
  .write(file);
});

test('write: should write external map files', function(t) {
  var file = makeFile();
  var pipeline = sourcemaps.write('../maps', {destPath: 'dist'});
  var fileCount = 0;
  var outFiles = [];
  var sourceMap;
  pipeline.on('data', function(data) {
    outFiles.push(data);
    fileCount++;
    if (fileCount == 2) {
      outFiles.reverse().map(function(data) {
        if (data.path === path.join(__dirname, 'assets/helloworld.js')) {
          sourceMap = data.sourceMap;
          t.ok(data instanceof File, 'should pass a vinyl file through');
          t.deepEqual(data, file, 'should not change file');
          t.equal(String(data.contents), sourceContent + '\n//# sourceMappingURL=../maps/helloworld.js.map\n', 'should add a comment referencing the source map file');
          t.equal(sourceMap.file, '../dist/helloworld.js');
        } else {
          t.ok(data instanceof File, 'should pass a vinyl file through');
          t.equal(data.path, path.join(__dirname, 'maps/helloworld.js.map'));
          t.deepEqual(JSON.parse(data.contents), sourceMap, 'should have the file\'s source map as content');
          t.equal(data.stat.isFile(), true, "should have correct stats");
          t.equal(data.stat.isDirectory(), false, "should have correct stats");
          t.equal(data.stat.isBlockDevice(), false, "should have correct stats");
          t.equal(data.stat.isCharacterDevice(), false, "should have correct stats");
          t.equal(data.stat.isSymbolicLink(), false, "should have correct stats");
          t.equal(data.stat.isFIFO(), false, "should have correct stats");
          t.equal(data.stat.isSocket(), false, "should have correct stats");
        }
      });
      t.end();
    }
  }).on('error', function() {
    t.fail('emitted error');
    t.end();
  }).write(file);
});

test('write:clone - should keep original file history', function(t) {
    var file = makeFile();
    var pipeline = sourcemaps.write('../maps', {destPath: 'dist'});
    var outFiles = [];
    var fileCount = 0;
    pipeline
        .on('data', function(data) {
            outFiles.push(data);
            fileCount++;
            if (fileCount == 2) {
                outFiles.reverse().map(function (data) {
                    if (data.path === path.join(__dirname, 'maps/helloworld.js.map')) {
                        t.equal(data.history[0], path.join(__dirname, 'assets', 'helloworld.js'), 'should keep file history');
                    }
                });
                t.end();
            }
        })
        .on('error', function() {
            t.fail('emitted error');
            t.end();
        })
        .write(file);
});

test('write: should allow to rename map file', function(t) {
  var file = makeFile();
  var pipeline = sourcemaps.write('../maps', {
    mapFile: function(mapFile) {
      return mapFile.replace('.js.map', '.map');
    },
    destPath: 'dist'
  });
  var fileCount = 0;
  var outFiles = [];
  var sourceMap;
  pipeline.on('data', function(data) {
    outFiles.push(data);
    fileCount++;
    if (fileCount == 2) {
      outFiles.reverse().map(function(data) {
        if (data.path === path.join(__dirname, 'assets/helloworld.js')) {
          sourceMap = data.sourceMap;
          t.ok(data instanceof File, 'should pass a vinyl file through');
          t.deepEqual(data, file, 'should not change file');
          t.equal(String(data.contents), sourceContent + '\n//# sourceMappingURL=../maps/helloworld.map\n', 'should add a comment referencing the source map file');
          t.equal(sourceMap.file, '../dist/helloworld.js');
        } else {
          t.ok(data instanceof File, 'should pass a vinyl file through');
          t.equal(data.path, path.join(__dirname, 'maps/helloworld.map'));
          t.deepEqual(JSON.parse(data.contents), sourceMap, 'should have the file\'s source map as content');
        }
      });
      t.end();
    }
  }).on('error', function() {
    t.fail('emitted error');
    t.end();
  }).write(file);
});

test('write: should create shortest path to map in file comment', function(t) {
  var file = makeNestedFile();
  var pipeline = sourcemaps.write('dir1/maps');
  var fileCount = 0;
  var outFiles = [];
  pipeline.on('data', function(data) {
    outFiles.push(data);
    fileCount++;
    if (fileCount == 2) {
      outFiles.reverse().map(function(data) {
        if (data.path === path.join(__dirname, 'assets/dir1/dir2/helloworld.js')) {
          t.equal(String(data.contents), sourceContent + '\n//# sourceMappingURL=../maps/dir1/dir2/helloworld.js.map\n', 'should add a comment referencing the source map file');
        }
      });
      t.end();
    }
  }).on('error', function() {
    t.fail('emitted error');
    t.end();
  }).write(file);
});

test('write: should write no comment with option addComment=false', function(t) {
  var file = makeFile();
  var pipeline = sourcemaps.write({addComment: false});
  pipeline.on('data', function(data) {
    t.equal(String(data.contents), sourceContent, 'should not change file content');
    t.end();
  }).write(file);
});

test('write: should not include source content with option includeContent=false', function(t) {
  var file = makeFile();
  var pipeline = sourcemaps.write({includeContent: false});
  pipeline.on('data', function(data) {
    t.equal(data.sourceMap.sourcesContent, undefined, 'should not have source content');
    t.end();
  }).write(file);
});

test('write: should fetch missing sourceContent', function(t) {
  var file = makeFile();
  delete file.sourceMap.sourcesContent;
  var pipeline = sourcemaps.write();
  pipeline.on('data', function(data) {
    t.notEqual(data.sourceMap.sourcesContent, undefined, 'should have source content');
    t.deepEqual(data.sourceMap.sourcesContent, [sourceContent], 'should have correct source content');
    t.end();
  }).write(file);
});

test('write: should not throw when unable to fetch missing sourceContent', function(t) {
  var file = makeFile();
  file.sourceMap.sources[0] += '.invalid';
  delete file.sourceMap.sourcesContent;
  var pipeline = sourcemaps.write();
  pipeline.on('data', function(data) {
    t.notEqual(data.sourceMap.sourcesContent, undefined, 'should have source content');
    t.deepEqual(data.sourceMap.sourcesContent, [], 'should have correct source content');
    t.end();
  }).write(file);
});

test('write: should set the sourceRoot by option sourceRoot', function(t) {
  var file = makeFile();
  var pipeline = sourcemaps.write({sourceRoot: '/testSourceRoot'});
  pipeline.on('data', function(data) {
    t.deepEqual(data.sourceMap.sources, ['helloworld.js'], 'should have the correct sources');
    t.equal(data.sourceMap.sourceRoot, '/testSourceRoot', 'should set sourceRoot');
    t.end();
  }).write(file);
});

test('write: should set the mapSourcesAbsolute by option mapSourcesAbsolute', function(t) {
  var file = makeFile();
  var pipeline = sourcemaps.write({sourceRoot: '/testSourceRoot', mapSourcesAbsolute: true});
  pipeline.on('data', function(data) {
    t.deepEqual(data.sourceMap.sources, ['/assets/helloworld.js'], 'should have the correct sources');
    t.equal(data.sourceMap.sourceRoot, '/testSourceRoot', 'should set sourceRoot');
    t.end();
  }).write(file);
});

test('write: should set the sourceRoot by option sourceRoot, as a function', function(t) {
  var file = makeFile();
  var pipeline = sourcemaps.write({
    sourceRoot: function() {
      return '/testSourceRoot';
    }
  });
  pipeline.on('data', function(data) {
    t.equal(data.sourceMap.sourceRoot, '/testSourceRoot', 'should set sourceRoot');
    t.end();
  }).write(file);
});

test('write: should automatically determine sourceRoot if destPath is set', function(t) {
  var file = makeNestedFile();
  var pipeline = sourcemaps.write('.', {
    destPath: 'dist',
    includeContent: false
  });
  var fileCount = 0;
  var outFiles = [];

  pipeline.on('data', function(data) {
    outFiles.push(data);
    fileCount++;
    if (fileCount == 2) {
      outFiles.reverse().map(function(data) {
        if (data.path === path.join(__dirname, 'assets/dir1/dir2/helloworld.js')) {
          t.equal(data.sourceMap.sourceRoot, '../../../assets', 'should set correct sourceRoot');
          t.equal(data.sourceMap.file, 'helloworld.js');
        } else {
          t.equal(data.path, path.join(__dirname, 'assets/dir1/dir2/helloworld.js.map'));
        }
      });
      t.end();
    }
  }).on('error', function() {
    t.fail('emitted error');
    t.end();
  }).write(file);
});

test('write: should interpret relative path in sourceRoot as relative to destination', function(t) {
  var file = makeNestedFile();
  var pipeline = sourcemaps.write('.', {sourceRoot: '../src'});
  var fileCount = 0;
  var outFiles = [];

  pipeline.on('data', function(data) {
    outFiles.push(data);
    fileCount++;
    if (fileCount == 2) {
      outFiles.reverse().map(function(data) {
        if (data.path === path.join(__dirname, 'assets/dir1/dir2/helloworld.js')) {
          t.equal(data.sourceMap.sourceRoot, '../../../src', 'should set relative sourceRoot');
          t.equal(data.sourceMap.file, 'helloworld.js');
        } else {
          t.equal(data.path, path.join(__dirname, 'assets/dir1/dir2/helloworld.js.map'));
        }
      });
      t.end();
    }
  }).on('error', function() {
    t.fail('emitted error');
    t.end();
  }).write(file);
});

test('write: should interpret relative path in sourceRoot as relative to destination (part 2)', function(t) {
  var file = makeNestedFile();
  var pipeline = sourcemaps.write('.', {sourceRoot: ''});
  var fileCount = 0;
  var outFiles = [];

  pipeline.on('data', function(data) {
    outFiles.push(data);
    fileCount++;
    if (fileCount == 2) {
      outFiles.reverse().map(function(data) {
        if (data.path === path.join(__dirname, 'assets/dir1/dir2/helloworld.js')) {
          t.equal(data.sourceMap.sourceRoot, '../..', 'should set relative sourceRoot');
          t.equal(data.sourceMap.file, 'helloworld.js');
        } else {
          t.equal(data.path, path.join(__dirname, 'assets/dir1/dir2/helloworld.js.map'));
        }
      });
      t.end();
    }
  }).on('error', function() {
    t.fail('emitted error');
    t.end();
  }).write(file);
});

test('write: should interpret relative path in sourceRoot as relative to destination (part 3)', function(t) {
  var file = makeNestedFile();
  var pipeline = sourcemaps.write('maps', {sourceRoot: '../src'});
  var fileCount = 0;
  var outFiles = [];

  pipeline.on('data', function(data) {
    outFiles.push(data);
    fileCount++;
    if (fileCount == 2) {
      outFiles.reverse().map(function(data) {
        if (data.path === path.join(__dirname, 'assets/dir1/dir2/helloworld.js')) {
          t.equal(data.sourceMap.sourceRoot, '../../../../src', 'should set relative sourceRoot');
          t.equal(data.sourceMap.file, '../../../dir1/dir2/helloworld.js');
        } else {
          t.equal(data.path, path.join(__dirname, 'assets/maps/dir1/dir2/helloworld.js.map'));
        }
      });
      t.end();
    }
  }).on('error', function() {
    t.fail('emitted error');
    t.end();
  }).write(file);
});

test('write: should interpret relative path in sourceRoot as relative to destination (part 4)', function(t) {
  var file = makeNestedFile();
  var pipeline = sourcemaps.write('../maps', {
    sourceRoot: '../src',
    destPath: 'dist'
  });
  var fileCount = 0;
  var outFiles = [];

  pipeline.on('data', function(data) {
    outFiles.push(data);
    fileCount++;
    if (fileCount == 2) {
      outFiles.reverse().map(function(data) {
        if (data.path === path.join(__dirname, 'assets/dir1/dir2/helloworld.js')) {
          t.equal(data.sourceMap.sourceRoot, '../../../src', 'should set relative sourceRoot');
          t.equal(data.sourceMap.file, '../../../dist/dir1/dir2/helloworld.js');
        } else {
          t.equal(data.path, path.join(__dirname, 'maps/dir1/dir2/helloworld.js.map'));
        }
      });
      t.end();
    }
  }).on('error', function() {
    t.fail('emitted error');
    t.end();
  }).write(file);
});

test('write: should accept a sourceMappingURLPrefix', function(t) {
  var file = makeFile();
  var pipeline = sourcemaps.write('../maps', {sourceMappingURLPrefix: 'https://asset-host.example.com'});
  pipeline.on('data', function(data) {
    if (/helloworld\.js$/.test(data.path)) {
      t.equal(String(data.contents).match(/sourceMappingURL.*\n$/)[0], 'sourceMappingURL=https://asset-host.example.com/maps/helloworld.js.map\n');
      t.end();
    }
  }).write(file);
});

test('write: should accept a sourceMappingURLPrefix, as a function', function(t) {
  var file = makeFile();
  var pipeline = sourcemaps.write('../maps', {
    sourceMappingURLPrefix: function() {
      return 'https://asset-host.example.com';
    }
  });
  pipeline.on('data', function(data) {
    if (/helloworld\.js$/.test(data.path)) {
      t.equal(String(data.contents).match(/sourceMappingURL.*\n$/)[0], 'sourceMappingURL=https://asset-host.example.com/maps/helloworld.js.map\n');
      t.end();
    }
  }).write(file);
});

test('write: should invoke sourceMappingURLPrefix every time', function(t) {
  var times = 0;
  var pipeline = sourcemaps.write('../maps', {
    sourceMappingURLPrefix: function() {
      ++times;
      return 'https://asset-host.example.com/' + times;
    }
  });

  pipeline.on('data', function(data) {
    if (/helloworld\.js$/.test(data.path)) {
      t.equal(String(data.contents).match(/sourceMappingURL.*\n$/)[0], 'sourceMappingURL=https://asset-host.example.com/' + times + '/maps/helloworld.js.map\n');
      if (times >= 3) {
        t.end();
        return;
      }
      pipeline.write(makeFile());
    }
  }).write(makeFile());
});

test('write: null as sourceRoot should not set the sourceRoot', function(t) {
  var file = makeFile();
  var pipeline = sourcemaps.write({sourceRoot: null});
  pipeline.on('data', function(data) {
    t.equal(data.sourceMap.sourceRoot, undefined, 'should not set sourceRoot');
    t.end();
  }).write(file);
});

test('write: function returning null as sourceRoot should not set the sourceRoot', function(t) {
  var file = makeFile();
  var pipeline = sourcemaps.write({
    sourceRoot: function() {
      return null;
    }
  });
  pipeline.on('data', function(data) {
    t.equal(data.sourceMap.sourceRoot, undefined, 'should set sourceRoot');
    t.end();
  }).write(file);
});

test('write: empty string as sourceRoot should be kept', function(t) {
  var file = makeFile();
  var pipeline = sourcemaps.write({sourceRoot: ''});
  pipeline.on('data', function(data) {
    t.equal(data.sourceMap.sourceRoot, '', 'should keep empty string as sourceRoot');
    t.end();
  }).write(file);
});

test('write: should be able to fully control sourceMappingURL by the option sourceMappingURL', function(t) {
  var file = makeNestedFile();
  var pipeline = sourcemaps.write('../aaa/bbb/', {
    sourceMappingURL: function(file) {
      return 'http://maps.example.com/' + file.relative + '.map';
    }
  });
  pipeline.on('data', function(data) {
    if (/helloworld\.js$/.test(data.path)) {
      t.equal(String(data.contents), sourceContent + '\n//# sourceMappingURL=http://maps.example.com/dir1/dir2/helloworld.js.map\n', 'should add source map comment with custom url');
      t.end();
    }
  }).write(file);
});

test('write: should allow to change sources', function(t) {
  var file = makeFile();
  var pipeline = sourcemaps.write({
    mapSources: function(sourcePath, f) {
      t.equal(file,f, 'vinyl file gets passed');
      return '../src/' + sourcePath;
    }
  });
  pipeline.on('data', function(data) {
    t.deepEqual(data.sourceMap.sources, ['../src/helloworld.js'], 'should have the correct sources');
    t.end();
  }).on('error', function() {
    t.fail('emitted error');
    t.end();
  }).write(file);
});

test('write: can replace `mapSources` option with sourcemap.mapSources stream', function(t) {
  var file = makeFile();

  function assert(files) {
    t.deepEqual(files[0].sourceMap.sources, ['../src/helloworld.js'], 'should have the correct sources');
  }

  pipe([
    from.obj([file]),
    sourcemaps.mapSources(function(sourcePath, f) {
      t.equal(file,f, 'vinyl file gets passed');
      return '../src/' + sourcePath;
    }),
    sourcemaps.write(),
    concat(assert)
  ], function(err) {
    if (err) {
      t.fail('emitted error');
    }

    t.end();
  });
});

if (!yargs.ignoreLogTests){
  //should always be last as disabling a debug namespace does not work
  test('write: should output an error message if debug option is set and sourceContent is missing', function(t) {
    var file = makeFile();
    file.sourceMap.sources[0] += '.invalid';
    delete file.sourceMap.sourcesContent;

    var history = [];
    var unhook = hookStd.stderr(function(s) {
      history.push(s);
    });
    var pipeline = sourcemaps.write();

    var hasRegex =  function(regex){
      return function(s){
        return regex.test(s);
      };
    };
    pipeline.on('data', function() {
      unhook();
      console.log(JSON.stringify(history));
      t.ok(history.some(hasRegex(/No source content for "helloworld.js.invalid". Loading from file./g)), 'should log missing source content');
      t.ok(history.some(hasRegex(/source file not found: /g)), 'should warn about missing file');
      t.end();
    }).write(file);
  });
}
