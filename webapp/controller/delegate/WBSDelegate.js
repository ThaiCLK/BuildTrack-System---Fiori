sap.ui.define([
    "sap/ui/base/Object",
    "sap/ui/core/Fragment"
], function (BaseObject, Fragment) {
    "use strict";

    const CONFIG = {
        PIXELS_PER_DAY: 5,
        STEP_LABEL: 8
    };

    return BaseObject.extend("com.bts.zbts.controller.delegate.WBSDelegate", {

        constructor: function (oController) {
            this._pixelsPerDay = CONFIG.PIXELS_PER_DAY;
            this._dChartStartDate = null;
            this._pWBSPopover = null;
        },

        /* =========================================================== */
        /* PRIVATE HELPERS                                             */
        /* =========================================================== */

        /**
         * Chuyển đổi giá trị đầu vào thành đối tượng Date (hỗ trợ string, timestamp, Date)
         */
        _parseDate: function (value) {
            if (!value) return null;
            if (value instanceof Date) return value;
            
            var sVal = String(value);

            // Handle OData v2 /Date(ms)/ format
            if (sVal.indexOf("/Date(") === 0) {
                var iMs = parseInt(sVal.replace(/[^0-9]/g, ""), 10);
                return isNaN(iMs) ? null : new Date(iMs);
            }

            // Normal Date.parse (supports YYYY-MM-DD and others)
            var iTimestamp = Date.parse(value);
            if (!isNaN(iTimestamp)) return new Date(iTimestamp);

            // Handle DD/MM/YYYY specifically
            if (sVal.includes('/')) {
                var aParts = sVal.split('/');
                if (aParts.length === 3) {
                    return new Date(parseInt(aParts[2], 10), parseInt(aParts[1], 10) - 1, parseInt(aParts[0], 10));
                }
            }
            return null;
        },

        /* =========================================================== */
        /* DATA PROCESSING                                             */
        /* =========================================================== */

        /**
         * Hàm tổng hợp: Tính toán lại ngày cho WBS và khởi tạo cấu hình Gantt
         */
        prepareGanttData: function (aNodes) {
            this._enrichWbsDates(aNodes || []);
            return this._calculateGanttLogic(aNodes || []);
        },

        /**
         * Tính toán ngày Start/End cho các node cha (WBS) dựa trên min/max của các node con
         */
        _enrichWbsDates: function (aNodes) {
            var that = this;
            aNodes.forEach(function (node) {
                if (node.children && node.children.length > 0) {
                    that._enrichWbsDates(node.children);

                    // Only auto-derive parent dates from children when the parent
                    // doesn't have explicitly set dates.  Never overwrite dates that
                    // came from the server — this was causing edited EndDate values to
                    // be reset to children's max every time data reloaded.
                    var bNeedsStart = !node.StartDate;
                    var bNeedsEnd = !node.EndDate;

                    if (!bNeedsStart && !bNeedsEnd) return; // both already exist, skip

                    var minStart = null;
                    var maxEnd = null;

                    node.children.forEach(function (child) {
                        var dStart = that._parseDate(child.StartDate);
                        var dEnd = that._parseDate(child.EndDate);

                        if (dStart && (!minStart || dStart < minStart)) minStart = dStart;
                        if (dEnd && (!maxEnd || dEnd > maxEnd)) maxEnd = dEnd;
                    });

                    if (bNeedsStart && minStart) node.StartDate = minStart;
                    if (bNeedsEnd && maxEnd) node.EndDate = maxEnd;
                }
            });
        },

        /**
         * Xác định phạm vi ngày của toàn bộ Chart và tạo dữ liệu TimeScale
         */
        _calculateGanttLogic: function (aNodes) {
            var minDate = null;
            var maxDate = null;
            var that = this;

            var collectDates = function (nodes) {
                nodes.forEach(function (node) {
                    // CŨ: node.start_date / node.end_date (snake_case không khớp data)
                    var dStart = that._parseDate(node.StartDate);
                    var dEnd = that._parseDate(node.EndDate);

                    if (dStart) {
                        if (!minDate || dStart < minDate) minDate = dStart;
                        if (!maxDate || dStart > maxDate) maxDate = dStart;
                    }
                    if (dEnd) {
                        if (!minDate || dEnd < minDate) minDate = dEnd;
                        if (!maxDate || dEnd > maxDate) maxDate = dEnd;
                    }
                    if (node.children && node.children.length > 0) collectDates(node.children);
                });
            };

            collectDates(aNodes);

            minDate = minDate || new Date();
            maxDate = maxDate || new Date();

            // Bắt đầu từ đầu tháng của ngày sớm nhất
            var chartStart = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
            chartStart.setHours(0, 0, 0, 0);
            this._dChartStartDate = chartStart;

            // Kết thúc vào cuối tháng (cộng thêm 2 tháng đệm)
            var chartEnd = new Date(maxDate.getFullYear(), maxDate.getMonth() + 2, 0);
            chartEnd.setHours(0, 0, 0, 0);

            var generated = this._generateTimeScale(chartStart, chartEnd);
            return {
                timeScale: generated.timeScale,
                totalWidth: generated.totalWidth,
                pixelsPerDay: this._pixelsPerDay,
                chartStartDate: chartStart
            };
        },

        /**
         * Sinh dữ liệu các cột tháng và ngày cho Header của Gantt
         */
        _generateTimeScale: function (dStart, dEnd) {
            var timeScale = [];
            var totalDays = 0;
            var current = new Date(dStart);
            var MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

            while (current.getTime() <= dEnd.getTime()) {
                var currentMonth = current.getMonth();
                var currentYear = current.getFullYear();
                var nextMonth = new Date(currentYear, currentMonth + 1, 1);
                var daysInThisMonth = [];
                var iterDate = new Date(current);

                while (iterDate.getTime() < nextMonth.getTime() && iterDate.getTime() <= dEnd.getTime()) {
                    var dayNum = iterDate.getDate();
                    var label = (dayNum === 1 || dayNum % CONFIG.STEP_LABEL === 0) ? String(dayNum) : "";

                    daysInThisMonth.push({
                        dayLabel: label,
                        dayWidth: this._pixelsPerDay + "px"
                    });

                    totalDays++;
                    iterDate.setDate(iterDate.getDate() + 1);
                }

                timeScale.push({
                    monthLabel: MONTH_NAMES[currentMonth] + " " + currentYear,
                    monthWidth: (daysInThisMonth.length * this._pixelsPerDay) + "px",
                    days: daysInThisMonth
                });
                current = nextMonth;
            }

            return {
                timeScale: timeScale,
                totalWidth: (totalDays * this._pixelsPerDay) + "px"
            };
        },

        /* =========================================================== */
        /* GANTT CALCULATIONS (Formatters)                             */
        /* =========================================================== */

        isRootNode: function (vParentId) {
            // SAP backend returns GUID zero, null, or empty string for root nodes
            // We also check for literal strings "null" or "undefined" as a safety measure
            if (vParentId === null || vParentId === undefined || vParentId === "") return true;
            
            var sVal = String(vParentId).toLowerCase().trim();
            if (sVal === "null" || sVal === "undefined") return true;
            
            var sClean = sVal.replace(/-/g, "");
            return /^0+$/.test(sClean);
        },

        isChildNode: function (vParentId) {
            if (vParentId === null || vParentId === undefined || vParentId === "") return false;
            
            var sVal = String(vParentId).toLowerCase().trim();
            if (sVal === "null" || sVal === "undefined") return false;
            
            var sClean = sVal.replace(/-/g, "");
            return !/^0+$/.test(sClean);
        },
        /**
         * Tính toán khoảng cách từ lề trái chart đến điểm bắt đầu của task
         */
        calcMargin: function (sStart) {
            if (!sStart || !this._dChartStartDate) return "0px";
            var dStart = this._parseDate(sStart);
            if (!dStart) return "0px";

            dStart.setHours(0, 0, 0, 0);
            var diffDays = Math.round((dStart - this._dChartStartDate) / (1000 * 60 * 60 * 24));
            if (diffDays < 0) diffDays = 0;

            return (diffDays * this._pixelsPerDay) + "px";
        },

        /**
         * Tính toán chiều rộng của thanh task dựa trên số ngày làm việc
         */
        calcWidth: function (sStart, sEnd) {
            if (!sStart || !sEnd) return "0px";
            var dStart = this._parseDate(sStart);
            var dEnd = this._parseDate(sEnd);
            if (!dStart || !dEnd) return "0px";

            dStart.setHours(0, 0, 0, 0);
            dEnd.setHours(0, 0, 0, 0);

            var diffDays = Math.round((dEnd.getTime() - dStart.getTime()) / (1000 * 3600 * 24));
            return ((diffDays + 1) * this._pixelsPerDay) + "px";
        },

        /* =========================================================== */
        /* UI HANDLERS                                                 */
        /* =========================================================== */

        /**
         * Logic nạp và hiển thị Popover chi tiết
         */
        onOpenWBSPopover: function (oEvent, oController) {
            var oRowContext = oEvent.getParameter("rowBindingContext");
            var oControl = oEvent.getParameter("cellDomRef");

            if (!oRowContext || oRowContext.getObject().Type !== "PLAN") return;

            var oView = oController.getView();

            if (!this._pWBSPopover) {
                this._pWBSPopover = Fragment.load({
                    id: oView.getId(),
                    name: "com.bts.zbts.view.fragments.wbs.WBSDetailPopover",
                    controller: oController
                }).then(function (oPopover) {
                    oView.addDependent(oPopover);
                    return oPopover;
                });
            }

            this._pWBSPopover.then(function (oPopover) {
                oPopover.bindElement({ path: oRowContext.getPath(), model: "viewData" });
                oPopover.openBy(oControl);
            });
        },

        /**
         * Đóng Popover đang hiển thị
         */
        onClosePopover: function () {
            if (this._pWBSPopover) {
                this._pWBSPopover.then(function (oPopover) { oPopover.close(); });
            }
        }
    });
});