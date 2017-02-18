/**
 * This type of matrix does all calculations in the browser.
 *
 * You need to provide at least a store that contains the records
 * that need to be processed.
 *
 * The store records are processed in batch jobs to avoid freezing the browser.
 * You can also configure how many records should be processed per job
 * and time to wait between jobs.
 *
 *
 * Example:
 *
 *      {
 *          xtype: 'pivotgrid',
 *          matrix: {
 *              type: 'local',
 *              store: 'yourStore',
 *              leftAxis: [...],
 *              topAxis: [...],
 *              aggregate: [...]
 *          }
 *      }
 *
 */
Ext.define('Ext.pivot.matrix.Local', {
    alternateClassName: [
        'Mz.aggregate.matrix.Local'
    ],

    extend: 'Ext.pivot.matrix.Base',
    
    alias:  'pivotmatrix.local',

    requires: [
        'Ext.pivot.matrix.Base',
        'Ext.pivot.axis.Local',
        'Ext.pivot.result.Local'
    ],

    resultType:     'local',
    leftAxisType:   'local',
    topAxisType:    'local',

    /**
     * Fires before updating the matrix data due to a change in the bound store.
     *
     * @event beforeupdate
     * @param {Ext.pivot.matrix.Base} matrix Reference to the Matrix object
     * @private
     */

    /**
     * Fires after updating the matrix data due to a change in the bound store.
     *
     * @event afterupdate
     * @param {Ext.pivot.matrix.Base} matrix Reference to the Matrix object
     * @private
     */

    /**
     * @cfg {Ext.data.Store/String} store (required)
     *
     * This is the store that needs to be processed. The store should contain all records
     * and cannot be paginated or buffered.
     */
    store:              null,
    
    /**
     * @cfg {Number} recordsPerJob
     *
     * The matrix processes the records in multiple jobs.
     * Specify here how many records should be processed in a single job.
     */
    recordsPerJob:      1000,
    
    /**
     * @cfg {Number} timeBetweenJobs
     *
     * How many milliseconds between processing jobs?
     */
    timeBetweenJobs:    2,

    onInitialize: function(){
        var me = this;
        
        me.localDelayedTask = new Ext.util.DelayedTask(me.delayedProcess, me);
        me.recordsToAddDelayedTask = new Ext.util.DelayedTask(me.onOriginalStoreAddDelayed, me);
        me.recordsToUpdateDelayedTask = new Ext.util.DelayedTask(me.onOriginalStoreUpdateDelayed, me);
        me.recordsToRemoveDelayedTask = new Ext.util.DelayedTask(me.onOriginalStoreRemoveDelayed, me);

        me.initializeStore({store: me.store});

        me.callParent(arguments);
    },

    initializeStore: function(config){
        var me = this,
            store, newStore;

        me.processedRecords = {};

        if(config.store){
            // a new store was passed to
            newStore = config.store;
        }else{
            if(me.store){
                if(me.store.isStore && !me.storeListeners){
                    // we have a store but no listeners were attached to it
                    store = me.store;
                }else{
                    // we need to initialize the store that we got
                    newStore = me.store;
                }
            }
        }

        if(newStore){
            store = Ext.getStore(newStore || '');
            if(Ext.isEmpty(store) && Ext.isString(newStore)){
                store = Ext.create(newStore);
            }
        }

        if(store && store.isStore){
            Ext.destroy(me.storeListeners);

            if(me.store && me.store.autoDestroy && store != me.store){
                Ext.destroy(me.store);
            }

            // let's initialize the store (if needed)
            me.store = store;
            // add listeners to the store
            me.storeListeners = me.store.on({
                refresh:        me.startProcess,
                //datachanged:    me.startProcess,
                beforeload:     me.onOriginalStoreBeforeLoad,
                add:            me.onOriginalStoreAdd,
                update:         me.onOriginalStoreUpdate,
                remove:         me.onOriginalStoreRemove,
                clear:          me.startProcess,
                scope:          me,
                destroyable:    true
            });

            if(store.isLoaded()){
                me.startProcess();
            }
        }
    },
    
    onReconfigure: function(config){
        this.initializeStore(config);
        this.callParent(arguments);
    },
    
    onDestroy: function(){
        var me = this;
        
        me.localDelayedTask.cancel();
        me.localDelayedTask = null;
        me.recordsToAddDelayedTask.cancel();
        me.recordsToAddDelayedTask = null;
        me.recordsToUpdateDelayedTask.cancel();
        me.recordsToUpdateDelayedTask = null;
        me.recordsToRemoveDelayedTask.cancel();
        me.recordsToRemoveDelayedTask = null;

        if(Ext.isArray(me.records)){
            me.records.length = 0;
        }
        me.records = me.recordsToAdd = me.recordsToUpdate = me.recordsToRemove = null;
        
        Ext.destroy(me.storeListeners);
        if(me.store && me.store.isStore && me.store.autoDestroy){
            Ext.destroy(me.store);
        }
        me.store = me.storeListeners = me.processedRecords = null;
        
        me.callParent(arguments);
    },
    
    /**
     * @private
     */
    onOriginalStoreBeforeLoad: function(store){
        this.fireEvent('start', this);
    },
    
    /**
     * @private
     */
    onOriginalStoreAdd: function(store, records){
        var me = this;
        
        me.recordsToAdd = me.recordsToAdd || [];
        Ext.Array.insert(me.recordsToAdd, me.recordsToAdd.length, Ext.Array.from(records));
        
        me.recordsToAddDelayedTask.delay(100);
    },
    
    /**
     * @private
     */
    onOriginalStoreAddDelayed: function(){
        var me = this,
            items = [],
            len, i, records, record, obj;

        records = Ext.Array.from(me.recordsToAdd || []);
        len = records.length;
        for(i = 0; i < len; i++){
            record = records[i];
            me.processRecord(record, i, len);

            obj = me.processedRecords[record.internalId];
            if(obj.left.length){
                Ext.Array.insert(items, items.length, obj.left);
            }
        }

        me.recordsToAdd = [];

        // the new records might have created new groups on left axis
        // which means that we need to create subtotals for them
        len = items.length;
        if(len) {
            me.leftAxis.rebuildTree();
            me.topAxis.rebuildTree();
            for (i = 0; i < len; i++) {
                obj = items[i];
                if ((obj.children && !obj.records) || (!obj.children && !obj.record)) {
                    me.addRecordToPivotStore(obj);
                }
            }
        }

        me.recalculateResults(me.store, records, len > 0);
    },
    
    /**
     * @private
     */
    onOriginalStoreUpdate: function(store, records){
        var me = this;
        
        me.recordsToUpdate = me.recordsToUpdate || [];
        Ext.Array.insert(me.recordsToUpdate, me.recordsToUpdate.length, Ext.Array.from(records));
        
        me.recordsToUpdateDelayedTask.delay(100);
    },
    
    /**
     * @private
     */
    onOriginalStoreUpdateDelayed: function(){
        var me = this,
            items = [],
            dimensions = me.leftAxis.dimensions.items,
            length = dimensions.length,
            len, i, j, records, record, obj, changed, dim;

        records = Ext.Array.from(me.recordsToUpdate || []);
        len = records.length;
        for(i = 0; i < len; i++){
            record = records[i];

            // if the record changed on one of the leftAxis dimensions then
            // we need to process it again
            changed = false;
            for(j = 0; j < length; j++){
                dim = dimensions[j];
                if(record.isModified(dim.dataIndex)){
                    changed = true;
                    break;
                }
            }

            if(changed) {
                me.removeRecordFromResults(record);
                me.processRecord(record, i, len);

                obj = me.processedRecords[record.internalId];
                if (obj.left.length) {
                    Ext.Array.insert(items, items.length, obj.left);
                }
            }
        }

        me.recordsToUpdate = [];

        // the updated records might have created new groups on left axis
        // which means that we need to create subtotals for them
        len = items.length;
        if(len) {
            me.leftAxis.rebuildTree();
            me.topAxis.rebuildTree();
            for (i = 0; i < len; i++) {
                obj = items[i];
                if ((obj.children && !obj.records) || (!obj.children && !obj.record)) {
                    me.addRecordToPivotStore(obj);
                }
            }
        }

        me.recalculateResults(me.store, records, len > 0);
    },

    /**
     * @private
     */
    onOriginalStoreRemove: function(store, record, index, isMove){
        var me = this;

        if(isMove){
            //don't do anything. nothing changed in the data
            return;
        }

        me.recordsToRemove = me.recordsToRemove || [];
        Ext.Array.insert(me.recordsToRemove, me.recordsToRemove.length, Ext.Array.from(record));

        me.recordsToRemoveDelayedTask.delay(100);
    },

    onOriginalStoreRemoveDelayed: function(){
        var me = this,
            len, i, records, changed;

        records = Ext.Array.from(me.recordsToRemove || []);
        len = records.length;
        for(i = 0; i < len; i++){
            changed = me.removeRecordFromResults(records[i]) || changed;
        }

        me.recordsToRemove = [];
        if(changed) {
            me.leftAxis.rebuildTree();
            me.topAxis.rebuildTree();
        }

        me.recalculateResults(me.store, records, changed);
    },

    removeRecordFromResults: function(record){
        var me = this,
            obj = me.processedRecords[record.internalId],
            grandTotalKey = me.grandTotalKey,
            changed = false,
            result, item, i, j, len, length;

        if(!obj){
            // something's wrong here; the record should be there
            return changed;
        }

        result = me.results.get(grandTotalKey, grandTotalKey);
        if(result) {
            result.removeRecord(record);
            if(result.records.length === 0){
                me.results.remove(grandTotalKey, grandTotalKey);
            }
        }

        len = obj.top.length;
        for (i = 0; i < len; i++) {
            item = obj.top[i];
            result = me.results.get(grandTotalKey, item.key);
            if(result) {
                result.removeRecord(record);
                if(result.records.length === 0){
                    me.results.remove(grandTotalKey, item.key);
                    // the item needs to be removed
                    me.topAxis.items.remove(item);
                    changed = true;
                }
            }
        }

        len = obj.left.length;
        for (i = 0; i < len; i++) {
            item = obj.left[i];
            result = me.results.get(item.key, grandTotalKey);
            if(result) {
                result.removeRecord(record);
                if(result.records.length === 0){
                    me.results.remove(item.key, grandTotalKey);
                    // the item needs to be removed
                    me.leftAxis.items.remove(item);
                    changed = true;
                }
            }

            length = obj.top.length;
            for (j = 0; j < length; j++) {
                result = me.results.get(obj.left[i].key, obj.top[j].key);
                if(result) {
                    result.removeRecord(record);
                    if(result.records.length === 0){
                        me.results.remove(obj.left[i].key, obj.top[j].key);
                    }
                }
            }
        }
        return changed;
    },

    /**
     * @private
     */
    recalculateResults: function(store, records, changed){
        var me = this;

        me.fireEvent('beforeupdate', me, changed);

        me.buildModelAndColumns();
        // recalculate all results
        me.results.calculate();
        // now update the pivot store records
        Ext.Array.each(me.leftAxis.getTree(), me.updateRecordToPivotStore, me);
        // update all grand totals
        me.updateGrandTotalsToPivotStore();

        // 'changed' means that the structure of left/top axis has changed
        me.fireEvent('afterupdate', me, changed);
    },

    /**
     * @private
     */
    updateGrandTotalsToPivotStore: function(){
        var me = this,
            totals = [],
            i;
        
        if(me.totals.length <= 0){
            return;
        }

        totals.push({
            title:      me.textGrandTotalTpl,
            values:     me.preparePivotStoreRecordData({key: me.grandTotalKey})
        });
        
        // additional grand totals can be added. collect these using events or 
        if(Ext.isFunction(me.onBuildTotals)){
            me.onBuildTotals(totals);
        }
        me.fireEvent('buildtotals', me, totals);
        
        // update records to the pivot store for each grand total
        if(me.totals.length === totals.length){
            for(i = 0; i < me.totals.length; i++){
                if(Ext.isObject(totals[i]) && Ext.isObject(totals[i].values) && (me.totals[i].record instanceof Ext.data.Model) ){
                    delete(totals[i].values.id);
                    me.totals[i].record.set(totals[i].values);
                }
            }
        }
    },
    
    /**
     * @private
     */
    updateRecordToPivotStore: function(item){
        var me = this,
            dataIndex, data;

        if(!item.children){
            if(item.record){
                data = me.preparePivotStoreRecordData(item);
                delete(data['id']);
                item.record.set(data);
            }
        }else{
            // update all pivot store records of this item
            if(item.records){
                dataIndex = (me.viewLayoutType == 'outline' ? item.dimensionId : me.compactViewKey);
                data = me.preparePivotStoreRecordData(item);
                delete(data['id']);
                delete(data[dataIndex]);
                item.records.collapsed.set(data);
                if(me.rowSubTotalsPosition == 'first'){
                    item.records.expanded.set(data);
                }else{
                    if(me.rowSubTotalsPosition == 'last') {
                        item.records.footer.set(data);
                    }
                }
            }

            Ext.Array.each(item.children, me.updateRecordToPivotStore, me);
        }
    },
    
    startProcess: function(){
        var me = this;
        
        // if we don't have a store then do nothing
        if(!me.store || (me.store && !me.store.isStore) || me.isDestroyed || me.store.isLoading()){
            // nothing to do
            return;
        }

        me.clearData();
        
        me.localDelayedTask.delay(50);
    },
    
    delayedProcess: function(){
        var me = this;
        
        // let's start the process
        me.fireEvent('start', me);
        
        me.records = me.store.getRange();

        if(me.records.length == 0){
            me.endProcess();
            return;
        }
        
        me.statusInProgress = false;

        me.processRecords(0);
    },
    
    processRecords: function(position){
        var me = this,
            i = position,
            totalLength;
        
        // don't do anything if the matrix was destroyed while doing calculations.
        if(me.isDestroyed){
            return;
        }

        totalLength = me.records.length;
        
        me.statusInProgress = true;

        while(i < totalLength && i < position + me.recordsPerJob && me.statusInProgress){
            me.processRecord(me.records[i], i, totalLength);
            i++;
        }
        
        // if we reached the last record then stop the process
        if(i >= totalLength){
            me.statusInProgress = false;
            
            // now that the cells matrix was built let's calculate the aggregates
            me.results.calculate();

            // let's build the trees and apply value filters
            me.leftAxis.buildTree();
            me.topAxis.buildTree();

            // recalculate everything after applying the value filters
            if(me.filterApplied){
                me.results.calculate();
            }

            me.records = null;
            me.endProcess();
            return;
        }
        
        // if the matrix was not reconfigured meanwhile then start a new job
        if(me.statusInProgress && totalLength > 0){
            Ext.defer(me.processRecords, me.timeBetweenJobs, me, [i]);
        }
    },
    
    /**
     * Process the specified record and fire the 'progress' event
     *
     * @private
     */
    processRecord: function(record, index, length){
        var me = this,
            grandTotalKey = me.grandTotalKey,
            leftItems, topItems, i, j, len, length, records, item;

        // we keep track of processed records so that if they are changed we could
        // adjust the matrix calculations/tree
        me.processedRecords[record.internalId] = records = {
            left: [],
            top: []
        };

        // if null is returned that means it was filtered out
        // if array was returned that means it is valid
        leftItems = me.leftAxis.processRecord(record);
        topItems = me.topAxis.processRecord(record);

        // left and top items are added to their respective axis if the record
        // is not filtered out on both axis
        if(leftItems && topItems){
            me.results.add(grandTotalKey, grandTotalKey).addRecord(record);

            len = topItems.length;
            for (i = 0; i < len; i++) {
                item = topItems[i];
                me.topAxis.addItem(item);
                records.top.push(me.topAxis.items.map[item.key]);
                me.results.add(grandTotalKey, item.key).addRecord(record);
            }

            length = leftItems.length;
            for (i = 0; i < length; i++) {
                item = leftItems[i];
                me.leftAxis.addItem(item);
                records.left.push(me.leftAxis.items.map[item.key]);

                me.results.add(item.key, grandTotalKey).addRecord(record);

                for (j = 0; j < len; j++) {
                    me.results.add(item.key, topItems[j].key).addRecord(record);
                }
            }
        }

        me.fireEvent('progress', me, index + 1, length);
    },
    
    /**
     * Fetch all records that belong to the specified row group
     *
     * @param {String} key Row group key
     */
    getRecordsByRowGroup: function(key){
        var results = this.results.getByLeftKey(key),
            length = results.length,
            records = [], 
            i;
            
        for(i = 0; i < length; i++){
            Ext.Array.insert(records, records.length, results[i].records || []);
        }
        
        return records;
    },
    
    /**
     * Fetch all records that belong to the specified col group
     *
     * @param {String} key Col group key
     */
    getRecordsByColGroup: function(key){
        var results = this.results.getByTopKey(key),
            length = results.length,
            records = [], 
            i;
            
        for(i = 0; i < length; i++){
            Ext.Array.insert(records, records.length, results[i].records || []);
        }
        
        return records;
    },
    
    /**
     * Fetch all records that belong to the specified row/col group
     *
     * @param {String} rowKey Row group key
     * @param {String} colKey Col group key
     */
    getRecordsByGroups: function(rowKey, colKey){
        var result = this.results.get(rowKey, colKey);
        
        return ( result ? result.records || [] : []);
    }
    
});