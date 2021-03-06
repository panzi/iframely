(function(whitelist) {

    var chokidar = require('chokidar'),
        fs = require('fs'),
        path = require('path'),
        _ = require('underscore');

    var whitelistObject;
    var currentWhitelistFilename;
    var WHITELIST_DIR = './whitelist';

    function isAllowed(path) {
        var bits = path.split('.');
        var tags = getTags.apply(this, bits);
        return tags.indexOf("allow") > -1;
    }

    function getTags(source, type) {
        var s = this[source];
        var result = [];
        if (s) {
            result = s[type];
        }

        if (typeof result == "string") {
            result = [result];
        }

        return result;
    }

    function getWhitelistLinks(meta, rels) {

        var result = [];

        var sources = _.intersection(rels, CONFIG.KNOWN_SOURCES);

        if (sources.length == 0 && rels.indexOf("player") > -1) {

            if (meta && meta.video_src) {
                result.push({
                    source: "html-meta",
                    type: "video"
                });
            }

        } else {
            sources.forEach(function(source) {
                CONFIG.REL[source].forEach(function(type) {

                    var iframelyType = CONFIG.REL_MAP[type] || type;

                    if (rels.indexOf(iframelyType) > -1) {
                        result.push({
                            source: source,
                            type: type
                        });
                    }
                });
            });
        }

        return result;
    }

    whitelist.findWhitelistRecordFor= function(uri) {

        if (!whitelistObject) {
            return null;
        }

        var patterns = extractDomainPatters(uri);

        var record, i = 0;
        while(!record && i < patterns.length) {
            record = whitelistObject.domains[patterns[i]];
            if (record) {
                record = _.extend({
                    domain: patterns[i],
                    isAllowed: function(path) {
                        // String path: "og.video"
                        return isAllowed.apply(this, [path]);
                    },
                    getQATags: function(meta, rel) {
                        var links = getWhitelistLinks(meta, rel);
                        var that = this;
                        var tags = links.map(function(link) {
                            return getTags.apply(that, [link.source, link.type]);
                        });
                        tags = _.unique(_.flatten(tags));
                        // Remove allow if denied.
                        var allowIdx = tags.indexOf("allow");
                        var denyIdx = tags.indexOf("deny");
                        if (allowIdx > -1 && denyIdx > -1) {
                            tags.splice(allowIdx, 1);
                        }
                        return tags;
                    }
                }, record);
            }
            i++;
        }

        return record;
    };

    function extractDomain(uri) {
        var m = uri.match(/:\/\/([^/]+)/i);
        if (m) {
            return m[1];
        } else {
            return null;
        }
    }

    function extractDomainPatters(uri) {

        var patterns = [];

        var domain = extractDomain(uri);
        if (!domain) {
            return patterns;
        }

        // Only full domain exact match.
        patterns.push(domain);

        // 'www' workaround.
        var bits = domain.split('.');
        if (bits[0] != 'www') {
            patterns.push('www.' + domain);
        } else {
            // Remove www.
            bits.splice(0, 1);
            domain = bits.join('.');
            patterns.push(domain);
        }

        // Wildcard pattern matches parent and this domain.
        if (bits.length > 2) {
            for(var i = 0; i < bits.length - 1; i++) {
                var d = bits.slice(i).join('.');
                patterns.push('*.' + d);
            }
        } else {
            patterns.push('*.' + domain);
        }

        return patterns;
    }

    function readWhitelist(filename) {

        try {
            console.log('Loading whitelist:', filename);
            whitelistObject = JSON.parse(fs.readFileSync(filename, 'utf8'));
            currentWhitelistFilename = filename;
        } catch(ex) {
            console.log("Error loading whitelist:", ex);
        }
    }

    function findLastWhitelist() {

        var files = fs.readdirSync(WHITELIST_DIR);

        files = files.filter(function(path) {
            return /iframely-.*\.json/.test(path);
        });

        files.sort();

        if (files.length) {
            return path.resolve(WHITELIST_DIR, files[files.length -1]);
        } else {
            return null;
        }
    }

    function loadLastWhitelist() {

        var filename = findLastWhitelist();

        if (filename && filename != currentWhitelistFilename) {
            readWhitelist(filename);
        }
    }

    function startScanWhitelist() {

        var watcher = chokidar.watch(WHITELIST_DIR, {
            interval: 1000,
            binaryInterval: 1000,
            ignoreInitial: true
        });

        watcher.on('add', function(p) {
            p = path.resolve('.', p);
            // Check if newer file added.
            if (p.match(/iframely-.*\.json/)) {
                loadLastWhitelist();
            }
        });

        watcher.on('change', function(p) {
            p = path.resolve('.', p);
            // Reload last whitelist.
            if (p == currentWhitelistFilename) {
                readWhitelist(p);
            }
        });

        loadLastWhitelist();
    }

    startScanWhitelist();

})(exports);
