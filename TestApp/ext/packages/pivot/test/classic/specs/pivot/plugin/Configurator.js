/* global expect, Ext */

describe('Ext.pivot.plugin.Configurator', function () {
    var store, plugin, grid, record, column, field,
        events = {};

    function eventFired(event) {
        return function() {
            events = events || {};
            events[event] = true;
        };
    }

    function makeGrid(pluginCfg, gridCfg) {
        store = new Ext.data.Store({
            fields: [
                {name: 'person',    type: 'string'},
                {name: 'year',      type: 'integer'},
                {name: 'value',     type: 'float'}
            ],
            data: [
                { person: 'Lisa', year: 2012, value: 10 },
                { person: 'John', year: 2012, value: 10 },
                { person: 'Mary', year: 2012, value: 10 },
                { person: 'Lisa', year: 2013, value: 10 },
                { person: 'John', year: 2013, value: 10 },
                { person: 'Mary', year: 2013, value: 10 },
                { person: 'Mary', year: 2014, value: 10 }
            ],
            autoDestroy: true
        });

        plugin = new Ext.pivot.plugin.Configurator(Ext.merge({
            fields: [{
                dataIndex:  'person',
                header:     'Person',

                settings: {
                    // Define here what aggregator functions can be used when this field is
                    // used as an aggregate dimension
                    aggregators: ['count']
                }
            }, {
                dataIndex:  'year',
                header:     'Year',

                settings: {
                    // Define here what aggregator functions can be used when this field is
                    // used as an aggregate dimension
                    aggregators: ['count']
                }
            }, {
                dataIndex:  'value',
                header:     'Value'
            }]
        }, pluginCfg));

        grid = new Ext.pivot.Grid(Ext.merge({
            renderTo: Ext.getBody(),
            width: 500,
            height: 400,

            plugins: [plugin],

            listeners: {
                pivotDone: eventFired('done')
            },

            matrix: {
                type: 'local',
                store: store,

                aggregate: [{
                    dataIndex: 'value',
                    header: 'Total',
                    aggregator: 'sum',
                    // if you want an aggregate dimension to be editable you need to specify its editor
                    editor: 'numberfield'
                },{
                    dataIndex: 'value',
                    header: 'Count',
                    aggregator: 'count'
                }],

                leftAxis: [{
                    dataIndex: 'person',
                    header: 'Person'
                }],

                topAxis: [{
                    dataIndex: 'year',
                    header: 'Year'
                }]
            }
        }, gridCfg));

    }

    afterEach(function() {

        tearDown();
    });

    function tearDown() {
        store = plugin = grid = record = column = field = Ext.destroy(grid);
        events = {};
    }

    describe('finding the configurator plugin in a pivot grid', function() {
        beforeEach(function() {
            makeGrid({pluginId:'test-configurator'});
        });

        it('should find it by id', function() {
            waitsFor(function() {
                return events.done;
            });

            runs(function() {
                expect(grid.getPlugin('test-configurator')).toBe(plugin);
            });
        });
        it('should find it by ptype', function() {
            waitsFor(function() {
                return events.done;
            });

            runs(function() {
                expect(grid.findPlugin('pivotconfigurator')).toBe(plugin);
            });
        });
    });

    describe('configurator fields', function(){
        it('should render correctly the fields', function () {
            makeGrid();

            waitsFor(function() {
                return events.done;
            });

            runs(function() {
                var panel = plugin.getConfigPanel(),
                    fieldsAllCt = panel.getAllFieldsContainer(),
                    fieldsLeftCt = panel.getLeftAxisContainer(),
                    fieldsTopCt = panel.getTopAxisContainer(),
                    fieldsAggCt = panel.getAggregateContainer(),
                    items, field;

                items = fieldsAggCt.items.items;
                expect(items.length).toBe(2);
                field = items[0].getField();
                expect(field.getHeader()).toBe('Total');
                expect(field.getAggregator()).toBe('sum');
                field = items[1].getField();
                expect(field.getHeader()).toBe('Count');
                expect(field.getAggregator()).toBe('count');

                items = fieldsAllCt.items.items;
                expect(items.length).toBe(3);
                expect(items[0].getField().getHeader()).toBe('Person');
                expect(items[1].getField().getHeader()).toBe('Year');
                expect(items[2].getField().getHeader()).toBe('Value');

                items = fieldsLeftCt.items.items;
                expect(items.length).toBe(1);
                field = items[0].getField();
                expect(field.getHeader()).toBe('Person');

                items = fieldsTopCt.items.items;
                expect(items.length).toBe(1);
                field = items[0].getField();
                expect(field.getHeader()).toBe('Year');
            });
        });

    });

});