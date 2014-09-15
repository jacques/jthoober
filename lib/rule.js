var
    assert = require('assert'),
    bole   = require('bole'),
    child  = require('child_process'),
    events  = require('events'),
    fs     = require('fs'),
    util   = require('util')
    ;

var Rule = module.exports = function Rule(opts)
{
    assert(opts, 'you must pass an options object to the constructor');
    assert(opts.event && (typeof opts.event === 'string'), 'rules require an `event` string option');
    assert(opts.pattern && (opts.pattern instanceof RegExp), 'rules require a `pattern` regexp');

    assert(opts.script || opts.func, 'rules require either a `script` or a `func` option');
    if (opts.script)
        assert(typeof opts.script === 'string', 'the `script` option must be a string');
    if (opts.func)
        assert(typeof opts.func === 'function', 'the `func` option must be a function');

    events.EventEmitter.call(this);

    this.event    = opts.event;
    this.pattern  = opts.pattern;
    this.script   = opts.script;
    this.func     = opts.func;
    this.logfile  = opts.logfile;
    this.passargs = !!opts.passargs;

    this.logger = bole('rule:' + this.pattern + ':' + this.event);
};
util.inherits(Rule, events.EventEmitter);

Rule.prototype.event    = null;
Rule.prototype.repo     = null;
Rule.prototype.script   = null;
Rule.prototype.func     = null;
Rule.prototype.logger   = null;
Rule.prototype.logfile  = null;
Rule.prototype.passargs = false;
Rule.prototype.running  = false;

Rule.prototype.test = function(event)
{
    if (this.event !== event.event && this.event !== '*')
        return false;

    return (this.pattern.test(event.payload.repository.name));
};

Rule.prototype.execFunction = function(event)
{
    var self = this;

    self.logger.info('calling function');
    self.running = true;
    self.emit('running');
    self.func(event, function(err)
    {
        self.running = false;
        self.logger.info('function complete');
        self.emit('complete');
    });
};

Rule.prototype.exec = function(event)
{
    if (this.running)
    {
        this.logger.info('declining to execute while still in progress');
        return;
    }

    var self = this;

    if (self.func)
        return self.execFunction(event);

    var start = new Date();
    self.logger.info('starting execution');
    self.running = true;
    self.emit('running');

    var cmd = self.script;
    if (self.passargs)
        cmd += ' '  + event.payload.repository.name;

    child.exec(cmd, { env: process.env }, function (err, stdout, stderr)
    {
        if (self.logfile)
        {
            var end = new Date();
            var output = [];
            output.push('---');
            output.push(start.toISOString() + ' run started');
            output.push(stdout);
            output.push('--- err ---');
            output.push(stderr);
            output.push(end.toISOString() + ' run ended');

            fs.appendFile(self.logfile, output.join('\n'), 'utf8', function(err)
            {
                if (err) self.logger.error(err, 'while appending to logfile');
            });
        }

        self.running = false;
        self.logger.info('execution complete');
        self.emit('complete');
    });
};