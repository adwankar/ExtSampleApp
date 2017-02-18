/**
 * @private
 */
Ext.define('Ext.exporter.file.ooxml.excel.Cell', {
    extend: 'Ext.exporter.file.Base',

    isCell: true,

    config: {
        /**
         * @cfg {Ext.exporter.file.ooxml.excel.Row} row
         *
         * Reference to the parent row
         */
        row: null,
        /**
         * @cfg {String} dataType (required)
         *
         * The cell's data type. Possible values:
         *
         * - `b` (Boolean) Cell containing a boolean.
         * - `d` (Date) Cell contains a date in the ISO 8601 format.
         * - `e` (Error) Cell containing an error.
         * - `inlineStr` (InlineString) Cell containing an (inline) rich string, i.e., one not in the shared
         * string table. If this cell type is used, then the cell value is in the `is` element rather than the `v`
         * element in the cell (`c` element).
         * - `n` (Number) Cell containing a number.
         * - `s` (SharedString) Cell containing a shared string.
         * - `str` (String) Cell containing a formula string.
         */
        dataType: 's',
        /**
         * @cfg {Boolean} [showPhonetic]
         *
         * `true` if the cell should show phonetic.
         */
        showPhonetic: null,
        /**
         * @cfg {Number} index
         *
         * Specifies the column index of this cell within the containing row. If this tag is not specified, the first
         * instance of a Cell element within a row has an assumed Index="1".
         *
         */
        index: null,
        /**
         * @cfg {String} styleId
         *
         * The index of this cell's style. Style records are stored in the Styles Part.
         */
        styleId: null,
        /**
         * @cfg {Number} mergeAcross
         *
         * Number of cells to merge to the right side of this cell
         */
        mergeAcross: null,
        /**
         * @cfg {Number} mergeDown
         *
         * Number of cells to merge below this cell
         */
        mergeDown: null,
        /**
         * @cfg {Number/Date/String} value (required)
         *
         * Value assigned to this cell
         */
        value: ''
    },

    isMergedCell: false,

    tpl: [
        '<c r="{ref}"',
        '<tpl if="value != null"> t="{dataType}"</tpl>',
        '<tpl if="showPhonetic"> ph="1"</tpl>',
        '<tpl if="styleId"> s="{styleId}"</tpl>',
        '<tpl if="value == null">/><tpl else>><v>{value}</v></c></tpl>'
    ],

    constructor: function(config){
        var cfg = config;

        if(config == null || Ext.isDate(config) || Ext.isPrimitive(config)){
            cfg = {
                value: config
            };
        }
        return this.callParent([cfg]);
    },

    destroy: function(){
        this.setRow(null);
        this.callParent();
    },

    /**
     * Returns the cell reference using the A4 notation
     * @return {String}
     */
    getRef: function(){
        return this.getNotation(this._index) + this._row._index;
    },

    getRenderData: function(){
        var me = this,
            data = {},
            ws = me._row && me._row._worksheet,
            wb = ws && ws._workbook;

        data.dataType = me._dataType;
        data.value = me._value;
        data.showPhonetic = me._showPhonetic;
        data.styleId = me._styleId;
        if(this.isMergedCell && ws) {
            ws.setMergedCellsNo(ws._mergedCellsNo + 1);
        }
        if(data.dataType === 's' && wb){
            data.value = wb._sharedStrings.addString(data.value);
        }
        data.ref = this.getRef();

        return data;
    },

    applyValue: function(v){
        var dt;
        
        if(v != null) {
            if (typeof v === 'number') {
                dt = 'n';
            } else if (typeof v === 'string') {
                dt = 's';
                v = Ext.util.Format.stripTags(v);
            } else if (v instanceof Date) {
                dt = 'd';
                v = Ext.Date.format(v, 'Y-m-d\\TH:i:s.u');
            } else {
                dt = 'b';
            }

            this.setDataType(dt);
        }
        return v;
    },

    updateMergeAcross: function (v) {
        this.isMergedCell = (v || this._mergeDown);
    },

    updateMergeDown: function(v){
        this.isMergedCell = (v || this._mergeAcross);
    },

    getMergedCellRef: function () {
        var me = this,
            currIndex = me._index,
            rowIndex = me._row._index,
            mAcross = me._mergeAcross,
            mDown = me._mergeDown,
            s = me.getNotation(currIndex) + rowIndex + ':';

        if(mAcross){
            currIndex += mAcross;
        }
        if(mDown){
            rowIndex += mDown;
        }
        s += me.getNotation(currIndex) + rowIndex;
        return s;
    },

    /**
     * Formats a number to the A1 style
     *
     * @param index
     * @return {string}
     */
    getNotation: function(index){
        var code = 65,
            length = 26,
            getChar = String.fromCharCode,
            r, n;

        if(index <= 0){
            index = 1;
        }

        n = Math.floor(index / length);
        r = index % length;

        if(n === 0 || index === length){
            return getChar(code + index - 1);
        }else if(r === 0){
            return this.getNotation(n - 1) + 'Z';
        }else if(n < length){
            return getChar(code + n - 1) + getChar(code + r - 1);
        }else{
            return this.getNotation(n) + getChar(code + r - 1);
        }
    }
});