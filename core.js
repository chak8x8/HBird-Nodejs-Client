var LineByLineReader = require('line-by-line');
const replace = require('replace-in-file');

const START_REG = /[#|\/|*|}|{|(|)|-|%"^|<|>|!|REM|Rem|rem]+[ ]+HUMMINGBIRD[ ]+START.+/gm;
const ID_Line_REG = /[#|\/|*|}|{|(|)|-|%"^|<|>|!|REM|Rem|rem]+[ ]+\[{1}[A-z|0-9]+\]{1}[ ]+[#|\/|*|}|{|(|)|-|%"^|<|>|!|REM|Rem|rem]+/gm;
const ID_REG = /\[{1}[A-z|0-9]+\]{1}/;
const END_REG = /[#|\/|*|}|{|(|)|-|%"^|<|>|!|REM|Rem|rem]+[ ]+HUMMINGBIRD[ ]+END.+/gm;


function getBlocksFromFile(file, isHandleInEnd, callback) {
    var lr = new LineByLineReader(file);
    var blocks = {};
    var isInBlock = false;
    var blockId = undefined;
    var startline = "";

    lr.on('error', function (err) {
        // 'err' contains error object
    });

    lr.on('line', function (line) {
        // 'line' contains the current line without the trailing newline character.
        if (START_REG.test(line)) {
            //console.log(line);
            isInBlock = true;
            startline = line;
        } else if (ID_Line_REG.test(line) && isInBlock) {
            blockId = line.match(ID_REG)[0].replace("[", "").replace("]", "")
            blocks[blockId] = {
                startLine: startline,
                idLine: line,
                content: "",
                endLine: ""
            };
            //console.log(blockId);

        } else if (END_REG.test(line) && isInBlock) {
            //console.log(line);
            isInBlock = false;
            blocks[blockId].endLine = line
            blocks[blockId].content = blocks[blockId].content.substr(1);

            if (!isHandleInEnd && callback)
                callback(blockId, blocks[blockId]);
            blockId = undefined;
        } else if (blockId != undefined && isInBlock) {
            blocks[blockId].content += "\n" + line;
        }
    });

    lr.on('end', function () {
        // All lines are read, file is closed now.
        if (isHandleInEnd) {
            Object.keys(blocks).forEach(function (_blockId) {
                callback(_blockId, blocks[_blockId]);
            });
        }
    });
}

function updateBlocksinFile(file, newblock, callback) {
    getBlocksFromFile(file, true, (blockId, block) => {
        if (newblock.blockId == blockId) {
            try {
                var options = {
                    files: file,
                    from: block.startLine + "\n" + block.idLine + "\n" + block.content + "\n" + block.endLine + "\n",
                    to: block.startLine + "\n" + block.idLine + "\n" + newblock.content + "\n" + block.endLine + "\n",
                };

                const results = replace.sync(options);
                console.log('Replacement results:', results);
            } catch (error) {
                console.error('Error occurred:', error);
            }
        }
    })
}

module.exports.getBlocksFromFile = getBlocksFromFile;
module.exports.updateBlocksinFile = updateBlocksinFile;

// getBlocksFromFile("testFile",(id,block)=>{
//     console.log(id);
//     console.log(block);
// })