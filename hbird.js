const shortid = require('shortid');
const buildOptions = require('minimist-options');
const minimist = require('minimist');
const fileExists = require('file-exists');
const fs = require('fs');
const low = require('lowdb')
const FileSync = require('lowdb/adapters/FileSync')
var path = require('path');
var async = require('async');
const Enum = require('enum')
const core = require("./core");
var nwatch = require('node-watch');
var moment = require('moment');
var EventProxy = require('eventproxy');

const io = require("socket.io-client");
var ioClient = undefined;

const CONFIG_FILE = './config.json';
const DEFAULT_SERVICE_FILE = './default.json';
const DEFAULT_SERVICE = 'default';
const INJECT_LABEL = "HUMMINGBIRD";
const Mode = new Enum(['AUTO', 'PUSH', 'PULL', 'MANUAL', 'DISABLE', 'UNKNOWN']);

module.exports.INJECT_LABEL = INJECT_LABEL;

const options = buildOptions({
    config: {
        type: 'string',
        default: CONFIG_FILE
    },
    service: {
        type: 'string',
        alias: 's',
    },
    file: {
        type: 'string',
        alias: 'f',
    },
    language: {
        type: 'string',
        alias: 'l',
    },
    mode: {
        type: 'string',
        alias: 'm',
    },
    remote: {
        type: 'string',
        alias: 'r',
    },
    online: {
        type: 'boolean',
        alias: 'o',
        default: true
    },
});

var comments = require("./comments.json");
var fileExtensions = {}

const args = minimist(process.argv.slice(2), options);
var cwd = process.cwd();
console.log(args);
//console.log("cwd:"+cwd);

var conf = undefined;
var service = undefined;
var services = {};

Object.keys(comments).forEach(function (key) {
    var lang = comments[key];
    for (let postfix of lang.postfix) {
        //console.log(postfix);
        if (!(postfix in fileExtensions)) {
            fileExtensions[postfix] = [key];
        } else {
            fileExtensions[postfix].push(key);
        }
    }
});

//console.dir(fileExtensions);


function getLangCommentSymbolsByFilePath(filepath) {
    var postfix = path.extname(filepath);
    if (postfix in fileExtensions) {
        return comments[fileExtensions[postfix]];
    } else {
        return comments["default"];
    }
}

function getLangCommentSymbolsByLang(lang) {
    if (lang != undefined) {
        var _lang = lang.toLowerCase()
        for (key of Object.keys(comments)) {
            if (_lang.trim() == key.trim()) {
                return comments[key];
            }
        }
    }
    return comments["default"];
}

function getTempInjectBlock(langCom) {
    //langCom = getLangCommentSymbolsByFilePath(filepath);
    var _langCom = langCom
    if (langCom == undefined) {
        _langCom = comments["default"];
        console.warn("Force using default comment label!");
    }
    return _langCom.head + " " + INJECT_LABEL + " START " + _langCom.tail + "\n" +
        _langCom.head + " [" + shortid.generate() + "] " + _langCom.tail + "\n\nModify Text Here\n\n" +
        _langCom.head + " " + INJECT_LABEL + " END " + _langCom.tail + "\n";
}


function isCmd(cmdStr) {
    //console.log("isCmd " + cmdStr)
    return args._.includes(cmdStr);
}

function loadConfig() {
    console.log("loadConfig " + args.config)
    conf = low(new FileSync(args.config));
    //console.log("args.online " + args.online);
    if (args.remote != undefined) {
        conf.set("remote", args.remote).write();
    } else if (args.online != undefined) {
        conf.set("online", args.online).write();
    }
}

function loadService() {
    var serviceFile = services['default'];
    if (args.service != undefined) {
        if (args.service in services) {
            serviceFile = services[args.service];
        } else {
            console.log("The service is not exist! plz double check!");
            return false;
        }
    }
    console.debug("LoadService " + serviceFile);

    service = low(new FileSync(serviceFile));
    return true;
}

function newTextBlock() {
    console.log("Copy following text block to your text file and modify the block" +
        "\n----------------------------------------------------------------\n");

    console.log(getTempInjectBlock(getLangCommentSymbolsByLang(args.lang)));

    console.log("------------------------------------------------------------\n" +
        "Copy above text block to your text file and modify the block");
}

function getWatchingMode() {
    if (args.mode == undefined || args.mode.toLowerCase() == "auto" || args.mode.toLowerCase() == "enable") {
        return Mode.AUTO;
    } else if (args.mode.toLowerCase() == "disable") {
        return Mode.DISABLE;
    }
    return Mode.UNKNOWN;
}

function getBlockMode() {
    if (args.mode == undefined || args.mode.toLowerCase() == "auto" || args.mode.toLowerCase() == "enable") {
        return Mode.AUTO;
    } else if (args.mode.toLowerCase() == "push") {
        return Mode.PUSH;
    } else if (args.mode.toLowerCase() == "pull") {
        return Mode.PULL;
    } else if (args.mode.toLowerCase() == "manual") {
        return Mode.MANUAL;
    }
    return Mode.UNKNOWN;
}

function watch() {
    f = path.resolve(args.file);
    //console.log(path.resolve(args.file));
    fileExists(args.file, (err, exists) => {
        if (err) console.error(err);
        if (exists) {
            watchFiles = service.get("watchFiles").value();
            if (!(f in watchFiles)) {
                //console.log(f + " in service");
                watchFiles[f] = getWatchingMode();
                service.set("watchFiles", watchFiles).write();
                console.log("Added " + path.resolve(args.file) + " to watching list!");

            } else if (watchFiles[f] != getWatchingMode()) {
                watchFiles[f] = getWatchingMode();
                service.set("watchFiles", watchFiles).write();
                console.log("Updated " + path.resolve(args.file) + " in watching list!");
            } else {
                console.log("" + path.resolve(args.file) + " is already in watching list!");
            }
        } else {
            console.log(args.file + " is not Exist!");
        }
    });
}

function unwatch() {
    f = path.resolve(args.file);
    watchFiles = service.get("watchFiles").value();
    if (f in watchFiles) {
        console.log(f + " in service");
        delete watchFiles[f];
        service.set("watchFiles", watchFiles).write();
        console.log("Remove " + path.resolve(args.file) + " to watching list!");
    } else {
        console.log("" + path.resolve(args.file) + " is already in watching list!");
    }
}

function listfiles() {
    console.dir(service.get("watchFiles").value());
}

function listBlocks() {
    f = path.resolve(args.file);
    core.getBlocksFromFile(f, false, (id, block) => {
        console.log("Block:" + id + "\n<<<");
        console.log(block.content);
        console.log(">>>");
    })
    //loadService();
    //console.dir(conf.get("watchFiles"));
}

function getBlockStore(blockId) {
    return service.get("blocks." + blockId).value();
}

function initBlockStore(blockId, content, file) {
    console.log("initBlockStore for " + blockId);
    service.set("blocks." + blockId, {
        latest: {
            date: moment().valueOf(),
            content: content
        },
        version: [],
        files: [file],
        status: "ready"
    }).write();
}

function isBlockChanged(blockId, content, callback) {
    var b = getBlockStore(blockId);
    if (b != undefined) {
        if (callback)
            callback(blockId, b.latest.content != content, content);
    }
}

function syncBlock(blockId, content) {
    service.get("blocks." + blockId + ".version").push(service.get("blocks." + blockId + ".latest").cloneDeep().value()).write();
    service.get("blocks." + blockId + ".latest").assign({
        date: moment().valueOf(),
        content: content
    }).write();
}

function syncOtherFiles(blockId, content, curFile) {
    service.get("blocks." + blockId + ".files").value().forEach(file => {
        if (curFile == undefined || path.resolve(curFile) != path.resolve(file)) {
            console.log("trying to sync block " + blockId + " in " + file);
            core.updateBlocksinFile(file, {
                blockId: blockId,
                content: content
            });
        }
    });
}

function startListenRemote(callback) {
    const remote = conf.get("remote").value();
    if (remote != undefined) {
        ioClient = io.connect(remote);

        if (callback) callback();

        ioClient.on("update", (block) => {
            console.info("get update " + block.id + " event from remote!");
            syncBlock(block.id, block.latest);
            syncOtherFiles(block.id, block.latest);
        });


    } else {
        if (callback) callback();
    }
}

function greetBlockToRemote(blockId, content) {
    if (ioClient) {
        ioClient.emit('greeting', {
            id: blockId,
            content: content
        }, (response) => {
            if (response) {
                if (response.cmd == "pull") { // client ---> remote
                    var b = getBlockStore(blockId)
                    ioClient.emit('push', {
                        id: blockId,
                        latest:b.latest,
                        version: b.version
                    });
                } else if (response.cmd == "push") { // remote ---> client
                    syncBlock(blockId, response.latest.content);
                    syncOtherFiles(blockId, response.latest.content);
                }
            }
            //console.log(response);
        });
    }
}

function noticeUpdateToRemote(blockId, content) {
    if (ioClient) {
        ioClient.emit('update', {
            id: blockId,
            latest: content
        });
    }
}

function watchFile(filepath, callback) {
    nwatch(filepath, {
        recursive: true
    }, function (evt, name) {
        console.log('%s %s.', name, evt);
        //console.log(evt);
        if (evt == "update") {
            core.getBlocksFromFile(filepath, false, function (id, block) {
                isBlockChanged(id, block.content, function (bId, changed, _content) {
                    if (changed) {
                        console.log("block " + bId + " is changed!");
                        syncBlock(bId, block.content);
                        syncOtherFiles(bId, block.content, filepath);
                        noticeUpdateToRemote(bId, getBlockStore(bId).latest);
                    }
                });
            });
        }
    });

    core.getBlocksFromFile(filepath, true, function (blockId, block) {
        var b = getBlockStore(blockId);
        if (b != undefined) {
            if (!b.files.includes(filepath)) {
                b.files.push(filepath);

                service.get("blocks").find({
                    id: blockId
                }).assign(b).write();
            }
        } else {
            initBlockStore(blockId, block.content, filepath);
        }
        console.log("greetBlockToRemote for " + blockId);
        greetBlockToRemote(blockId, block.content);
        if (callback) callback(filepath);
    });
}

function startDeamon() {
    files = service.get("watchFiles").value();

    Object.keys(files).forEach(function (file) {
        watchFile(file);
    });
}

function handleAction() {
    //console.log(args.service);
    if (isCmd("service")) {
        console.dir(services["default"]);
    } else if (isCmd("services")) {
        console.dir(services);
    } else if (isCmd("addService")) {
        //console.dir(services);
    } else if (isCmd("watch")) {
        watch();
    } else if (isCmd("unwatch")) {
        unwatch();
    } else if (isCmd("files")) {
        listfiles();
    } else if (isCmd("ls")) {
        listBlocks();
    } else if (isCmd("new")) {
        newTextBlock();
    } else if (isCmd("deamon")) {
        startListenRemote(startDeamon);
        //startDeamon();
    }
}

async.series({
        loadOrInitConfig: function (callback) {

            fileExists(args.config, (err, exists) => {
                if (!exists) {
                    loadConfig();

                    conf.set("services", {
                        "default": DEFAULT_SERVICE_FILE
                    }).write();

                    services = conf.get("services").value();

                    loadService();
                    service.set("watchFiles", {}).write();
                    service.set("blocks", {}).write();

                } else {
                    loadConfig();
                    services = conf.get("services").value();
                    loadService();

                }
                callback();
            })
        },
        handleAction: function (callback) {
            //console.log("handleActions")
            handleAction();
            callback();
        }
    },
    function (err, results) {

    }
);