sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/core/routing/History",
    "sap/m/MessageBox",
    "sap/m/MessageToast",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/ui/model/Sorter",
    "z/bts/buildtrack/controller/delegate/DailyLogDelegate",
    "z/bts/buildtrack/controller/delegate/WorkSummaryDelegate",
    "z/bts/buildtrack/controller/delegate/ApprovalLogDelegate"
], function (Controller, History, MessageBox, MessageToast, JSONModel, Filter, FilterOperator, Sorter, DailyLogDelegate, WorkSummaryDelegate, ApprovalLogDelegate) {
    "use strict";


    var WBSDetailController = Controller.extend("z.bts.buildtrack.controller.WBSDetail", {

        /* =========================================================== */
        /* LIFECYCLE                                                    */
        /* =========================================================== */
        onInit: function () {
            // Route matching
            var oRouter = this.getOwnerComponent().getRouter();
            oRouter.getRoute("WBSDetail").attachPatternMatched(this._onObjectMatched, this);

<<<<<<< HEAD
            // Init Delegates
            DailyLogDelegate.init(this);
            WorkSummaryDelegate.init(this);
            ApprovalLogDelegate.init(this);

            // Location model for WBS location info
            var oLocationModel = new JSONModel({});
            this.getView().setModel(oLocationModel, "locationModel");

            // Work Summary model
            var oWSModel = new JSONModel({});
            this.getView().setModel(oWSModel, "workSummaryModel");

            // Project model for parent project info
            var oProjectModel = new JSONModel({});
            this.getView().setModel(oProjectModel, "projectModel");
        },

        /* =========================================================== */
        /* ROUTING                                                      */
        /* =========================================================== */
=======
            // 3. Khởi tạo model cho Daily Log
            this._initDailyLogModel();
        },

        /**
         * Sau khi view được render
         */
        onAfterRendering: function () {
            if (!this._dailyLogFragmentLoaded) {
                // Load fragment sau một chút để đảm bảo DOM đã sẵn sàng
                setTimeout(this._loadDailyLogFragment.bind(this), 100);
            }
        },

        /**
         * Handler khi tab được chọn
         */
        onIconTabBarSelect: function (oEvent) {
            var sKey = oEvent.getParameter("key");
            if (sKey === "dailyLogTab" && !this._dailyLogFragmentLoaded) {
                this._loadDailyLogFragment();
            }
        },

        /**
         * Load Daily Log Fragment programmatically
         */
        _loadDailyLogFragment: function () {
            var that = this;
            if (!this._dailyLogFragment) {
                console.log("Loading Daily Log fragment...");
                Fragment.load({
                    id: this.getView().getId(),
                    name: "z.bts.buildtrack.view.fragments.DailyLog",
                    controller: this
                }).then(function (oFragment) {
                    that._dailyLogFragment = oFragment;
                    that._dailyLogFragmentLoaded = true;
                    var oDailyLogTab = that.byId("idDailyLogTab");
                    if (oDailyLogTab) {
                        oDailyLogTab.removeAllContent();
                        oDailyLogTab.addContent(oFragment);
                        console.log("Daily Log fragment loaded successfully");
                    } else {
                        console.error("Daily Log tab not found");
                    }
                }).catch(function (error) {
                    console.error("Error loading DailyLog fragment:", error);
                    MessageBox.error("Không thể load Daily Log fragment: " + error.message);
                });
            }
        },

        /**
         * Khởi tạo Daily Log Model
         */
        _initDailyLogModel: function () {
            var oData = {
                ui: {
                    editMode: false,
                    isSelected: false
                },
                ZLOG_WORK: [
                    {
                        log_id: "LOG001",
                        wbs_id: "WBS01", wbs_name: "Cọc khoan nhồi T1",
                        log_date: new Date("2026-02-09"), location_name: "Trụ T1",
                        description: "Thi công cọc khoan nhồi đại trà cọc D1500",
                        weather_am_idx: 0, weather_pm_idx: 1,
                        man_cbkt: 2, man_cn: 15,
                        resources: [
                            { resource_name: "Máy xúc", unit: "chiếc", quantity: 2 },
                            { resource_name: "Cần cẩu", unit: "chiếc", quantity: 1 },
                            { resource_name: "Máy hàn", unit: "cái", quantity: 2 },
                            { resource_name: "Đầm dùi", unit: "cái", quantity: 4 },
                            { resource_name: "Ô tô", unit: "chiếc", quantity: 5 }
                        ],
                        qty_done: 10, unit: "md",
                        note_safety: "Đã kiểm tra an toàn khu vực thi công",
                        consultant_note: "Đồng ý tiến độ, yêu cầu kiểm tra chất lượng cọc",
                        contractor_note: "Đảm bảo tiến độ theo kế hoạch"
                    },
                    {
                        log_id: "LOG002",
                        wbs_id: "WBS02", wbs_name: "Đổ bê tông lót móng",
                        log_date: new Date("2026-02-10"), location_name: "Hố móng T1",
                        description: "Đổ bê tông lót móng M100 dày 10cm",
                        weather_am_idx: 2, weather_pm_idx: 2,
                        man_cbkt: 1, man_cn: 8,
                        resources: [
                            { resource_name: "Xe bồn", unit: "chiếc", quantity: 2 }
                        ],
                        qty_done: 25, unit: "m3",
                        note_safety: "Đã kiểm tra an toàn và vệ sinh công trường",
                        consultant_note: "Chất lượng tốt",
                        contractor_note: "Hoàn thành theo tiến độ"
                    },
                    {
                        log_id: "LOG003",
                        wbs_id: "WBS03", wbs_name: "Lắp dựng cốt thép bệ",
                        log_date: new Date("2026-02-11"), location_name: "Bệ trụ T1",
                        description: "Gia công và lắp dựng cốt thép bệ trụ",
                        weather_am_idx: 0, weather_pm_idx: 0,
                        man_cbkt: 2, man_cn: 20,
                        resources: [
                            { resource_name: "Cần cẩu", unit: "chiếc", quantity: 1 },
                            { resource_name: "Máy cắt sắt", unit: "cái", quantity: 2 },
                            { resource_name: "Máy hàn", unit: "cái", quantity: 4 }
                        ],
                        qty_done: 5.5, unit: "tấn",
                        note_safety: "Trang bị bảo hộ đầy đủ cho công nhân",
                        consultant_note: "Kiểm tra cốt thép đạt yêu cầu",
                        contractor_note: "Tiếp tục theo kế hoạch"
                    },
                    {
                        log_id: "LOG004",
                        wbs_id: "WBS04", wbs_name: "Lắp dựng ván khuôn",
                        log_date: new Date("2026-02-12"), location_name: "Bệ trụ T1",
                        description: "Lắp dựng ván khuôn thép định hình",
                        weather_am_idx: 1, weather_pm_idx: 1,
                        man_cbkt: 1, man_cn: 12,
                        resources: [
                            { resource_name: "Cần cẩu", unit: "chiếc", quantity: 1 },
                            { resource_name: "Máy hàn", unit: "cái", quantity: 2 },
                            { resource_name: "Xe tải", unit: "chiếc", quantity: 1 }
                        ],
                        qty_done: 40, unit: "m2",
                        note_safety: "Khu vực thi công được rào chắn",
                        consultant_note: "Ván khuôn lắp chính xác",
                        contractor_note: "Đúng tiến độ"
                    },
                    {
                        log_id: "LOG005",
                        wbs_id: "WBS05", wbs_name: "Đổ bê tông bệ trụ",
                        log_date: new Date("2026-02-13"), location_name: "Bệ trụ T1",
                        description: "Đổ bê tông thương phẩm M300",
                        weather_am_idx: 0, weather_pm_idx: 2,
                        man_cbkt: 3, man_cn: 15,
                        resources: [
                            { resource_name: "Cần cẩu", unit: "chiếc", quantity: 1 },
                            { resource_name: "Đầm dùi", unit: "cái", quantity: 4 },
                            { resource_name: "Xe bồn bê tông", unit: "chiếc", quantity: 6 }
                        ],
                        qty_done: 120, unit: "m3",
                        note_safety: "Đảm bảo an toàn khi đổ bê tông",
                        consultant_note: "Kiểm tra chất lượng bê tông tốt",
                        contractor_note: "Đổ liên tục, không ngắt quãng"
                    },
                    {
                        log_id: "LOG006",
                        wbs_id: "WBS06", wbs_name: "Tháo dỡ ván khuôn",
                        log_date: new Date("2026-02-15"), location_name: "Bệ trụ T1",
                        description: "Tháo dỡ ván khuôn và bảo dưỡng bê tông",
                        weather_am_idx: 1, weather_pm_idx: 1,
                        man_cbkt: 1, man_cn: 6,
                        resources: [
                            { resource_name: "Cần cẩu", unit: "chiếc", quantity: 1 },
                            { resource_name: "Xe tải", unit: "chiếc", quantity: 1 }
                        ],
                        qty_done: 1, unit: "ca",
                        note_safety: "An toàn khi làm việc trên cao",
                        consultant_note: "Bảo dưỡng bê tông đúng quy trình",
                        contractor_note: "Hoàn thành đúng thời gian"
                    }
                ],
                MasterData: {
                    ZWBS: [
                        { wbs_id: "WBS01", wbs_name: "Cọc khoan nhồi T1" },
                        { wbs_id: "WBS02", wbs_name: "Đổ bê tông lót móng" },
                        { wbs_id: "WBS03", wbs_name: "Lắp dựng cốt thép bệ" },
                        { wbs_id: "WBS04", wbs_name: "Lắp dựng ván khuôn" },
                        { wbs_id: "WBS05", wbs_name: "Đổ bê tông bệ trụ" },
                        { wbs_id: "WBS06", wbs_name: "Tháo dỡ ván khuôn" }
                    ]
                }
            };
            this.getView().setModel(new JSONModel(oData), "dailyLogModel");
        },
>>>>>>> 6aaffacac893a844e0765a765775f89e6b939cfe

        _onObjectMatched: function (oEvent) {
            var oArgs = oEvent.getParameter("arguments");
            var sWbsId = oArgs.wbsId;
            var sSiteId = oArgs.site_id;
            this._sWbsId = sWbsId;
            this._sSiteId = sSiteId;   // remember for onNavBack

            // Bind the WBS detail form — WbsId is Edm.Guid so use guid'' syntax
            var sObjectPath = "/WBSSet(guid'" + sWbsId + "')";
            this.getView().bindElement({
                path: sObjectPath,
                events: {
                    dataRequested: function () { this.getView().setBusy(true); }.bind(this),
                    dataReceived: function () { this.getView().setBusy(false); }.bind(this)
                }
            });

            // Bind daily log list
            this._bindDailyLogList(sWbsId);

            // Bind approval log list
            this._bindApprovalLogList(sWbsId);

            // Load location info
            this._loadLocation(sWbsId);

            // Load project info
            this._loadProjectInfo(sSiteId);

            // Load Work Summary info
            this._loadWorkSummary(sWbsId);

            // Reset daily log detail panel
            var oUIModel = this.getView().getModel("dailyLogModel");
            oUIModel.setProperty("/ui/isSelected", false);
            oUIModel.setProperty("/ui/editMode", false);
            oUIModel.setProperty("/selectedLog", null);

            // Reset approval log detail panel
            var oApprovalModel = this.getView().getModel("approvalModel");
            if (oApprovalModel) {
                oApprovalModel.setProperty("/selectedLog", {});
                oApprovalModel.setProperty("/ui/isSelected", false);
            }
        },

        /* =========================================================== */
        /* DAILY LOG LOGIC — delegated to DailyLogDelegate              */
        /* =========================================================== */

        /**
         * Load the single location record for a WBS.
         */
        _loadLocation: function (sWbsId) {
            var that = this;
            var oModel = this.getOwnerComponent().getModel();
            var oLocationModel = this.getView().getModel("locationModel");

            // Reset
            oLocationModel.setData({});

            oModel.read("/LocationSet", {
                filters: [new Filter("WbsId", FilterOperator.EQ, sWbsId)],
                success: function (oData) {
                    if (oData.results && oData.results.length > 0) {
                        oLocationModel.setData(oData.results[0]);
                    }
                },
                error: function () {
                    // No location data — form stays hidden
                }
            });
        },

        /**
         * Load project info from the configured SiteId
         */
        _loadProjectInfo: function (sSiteId) {
            var oModel = this.getOwnerComponent().getModel();
            var oProjectModel = this.getView().getModel("projectModel");

            // Reset
            oProjectModel.setData({});

            if (!sSiteId) {
                return;
            }

            // Read Site to get ProjectId and SiteName, then read Project to get ProjectName
            oModel.read("/SiteSet(guid'" + sSiteId + "')", {
                success: function (oSiteData) {
                    if (oSiteData && oSiteData.ProjectId) {
                        oModel.read("/ProjectSet(guid'" + oSiteData.ProjectId + "')", {
                            success: function (oProjectData) {
                                // Combine SiteName and ProjectName into the same model
                                oProjectData.SiteName = oSiteData.SiteName;
                                oProjectModel.setData(oProjectData);
                            }
                        });
                    } else if (oSiteData) {
                        oProjectModel.setData({ SiteName: oSiteData.SiteName });
                    }
                }
            });
        },

        /* =========================================================== */
        /* WORK SUMMARY LOGIC — delegated to WorkSummaryDelegate        */
        /* =========================================================== */

        onNavBack: function () {
            // Always navigate explicitly back to SiteDetail using the known site_id.
            // Using window.history.go(-1) is unreliable because OData operations
            // (element-binding refresh, batch calls) can inject extra browser-history
            // entries, causing the user to overshoot past the SiteDetail page.
            if (this._sSiteId) {
                this.getOwnerComponent().getRouter().navTo("SiteDetail", {
                    site_id: this._sSiteId
                }, true);
            } else {
                // Fallback: SAP router history or root
                var sPrev = History.getInstance().getPreviousHash();
                if (sPrev !== undefined) {
                    window.history.go(-1);
                } else {
                    this.getOwnerComponent().getRouter().navTo("RouteMain", {}, true);
                }
            }
        },

        /* =========================================================== */
        /* WBS Status Formatters                                        */
        /* =========================================================== */

<<<<<<< HEAD
        formatWbsStatusText: function (sStatus) {
            switch (sStatus) {
                case "PLANNING": return "Planning";
                case "PENDING_OPEN": return "Pending Open";
                case "OPEN_REJECTED": return "Open Rejected";
                case "OPENED": return "Opened";
                case "IN_PROGRESS": return "In Progress";
                case "PENDING_CLOSE": return "Pending Close";
                case "CLOSE_REJECTED": return "Close Rejected";
                case "CLOSED": return "Closed";
                // // Legacy
                // case "NEW": return "Planning";
                // case "INP": return "In Progress";
                // case "DON": return "Closed";
                // case "CAN": return "Closed";
                default: return sStatus || "";
            }
        },

        formatWbsStatusState: function (sStatus) {
            switch (sStatus) {
                case "PLANNING": return "None";
                case "PENDING_OPEN": return "Information";
                case "OPEN_REJECTED": return "Error";
                case "OPENED": return "Success";
                case "IN_PROGRESS": return "Warning";
                case "PENDING_CLOSE": return "Information";
                case "CLOSE_REJECTED": return "Error";
                case "CLOSED": return "None";
                // Legacy
                case "NEW": return "None";
                case "INP": return "Warning";
                default: return "None";
            }
        },

        formatWbsStatusIcon: function (sStatus) {
            switch (sStatus) {
                case "PLANNING": return "sap-icon://status-in-process";
                case "PENDING_OPEN": return "sap-icon://paper-plane";
                case "OPEN_REJECTED": return "sap-icon://decline";
                case "OPENED": return "sap-icon://accept";
                case "IN_PROGRESS": return "sap-icon://machine";
                case "PENDING_CLOSE": return "sap-icon://paper-plane";
                case "CLOSE_REJECTED": return "sap-icon://decline";
                case "CLOSED": return "sap-icon://locked";
                // Legacy
                case "NEW": return "sap-icon://status-in-process";
                case "INP": return "sap-icon://machine";
                case "DON": return "sap-icon://locked";
                default: return "sap-icon://status-in-process";
            }
        },




=======
        onLogItemSelect: function (oEvent) {
            var oItem = oEvent.getParameter("listItem");
            var oContext = oItem.getBindingContext("dailyLogModel");

            var oDetail = this.byId("idDailyLogDetailContainer");
            oDetail.setBindingContext(oContext, "dailyLogModel");

            var oModel = this.getView().getModel("dailyLogModel");
            oModel.setProperty("/ui/isSelected", true);
            oModel.setProperty("/ui/editMode", false);
        },

        onAddLog: function () {
            console.log("onAddLog called!");
            sap.m.MessageToast.show("Đang mở popup thêm nhật ký...");

            try {
                var that = this;
                var oModel = this.getView().getModel("dailyLogModel");

                if (!oModel) {
                    sap.m.MessageBox.error("Model dailyLogModel chưa được khởi tạo!");
                    return;
                }

                var oNewModel = new sap.ui.model.json.JSONModel({
                    log_id: "", log_date: new Date(), wbs_id: "",
                    weather_am_idx: 0, weather_pm_idx: 0,
                    man_cbkt: 0, man_cn: 0,
                    resources: [], // Mảng tài nguyên linh hoạt
                    description: "", location_name: "", qty_done: 0, unit: "",
                    note_safety: "", consultant_note: "", contractor_note: ""
                });

                // 1. Tạo nút Thêm tài nguyên
                var oAddResourceBtn = new sap.m.Button({
                    text: "Thêm tài nguyên",
                    icon: "sap-icon://add",
                    type: "Transparent",
                    press: function () {
                        var aResources = oNewModel.getProperty("/resources");
                        aResources.push({ resource_name: "", unit: "", quantity: 0 });
                        oNewModel.setProperty("/resources", aResources);
                    }
                });

                // 2. Tạo Bảng tài nguyên
                var oResourcesTable = new sap.m.Table({
                    growing: false,
                    width: "100%",
                    mode: "Delete",
                    delete: function (oEvent) {
                        var oItem = oEvent.getParameter("listItem");
                        var iIndex = oResourcesTable.indexOfItem(oItem);
                        var aResources = oNewModel.getProperty("/resources");
                        aResources.splice(iIndex, 1);
                        oNewModel.setProperty("/resources", aResources);
                    },
                    columns: [
                        new sap.m.Column({ width: "45%", header: new sap.m.Text({ text: "Tên tài nguyên" }) }),
                        new sap.m.Column({ width: "30%", header: new sap.m.Text({ text: "Đơn vị" }) }),
                        new sap.m.Column({ width: "25%", header: new sap.m.Text({ text: "Số lượng" }) })
                    ],
                    items: {
                        path: "new>/resources",
                        template: new sap.m.ColumnListItem({
                            cells: [
                                new sap.m.Input({ value: "{new>resource_name}", required: true }),
                                new sap.m.Input({ value: "{new>unit}" }),
                                new sap.m.Input({ value: "{new>quantity}", type: "Number", required: true })
                            ]
                        })
                    }
                });

                // 3. Gói Nút và Bảng vào VBox (Thiết lập GridData span 12 để hiển thị thẳng hàng cột 2)
                var oResourceVBox = new sap.m.VBox({
                    width: "100%",
                    layoutData: new sap.ui.layout.GridData({ span: "XL12 L12 M12 S12" }),
                    items: [oAddResourceBtn, oResourcesTable]
                });

                // 4. Tạo SimpleForm cấu trúc giống hệt Detail View
                var oForm = new sap.ui.layout.form.SimpleForm({
                    editable: true,
                    layout: "ResponsiveGridLayout",
                    labelSpanXL: 4, labelSpanL: 4, labelSpanM: 4, labelSpanS: 12,
                    adjustLabelSpan: false,
                    emptySpanXL: 0, emptySpanL: 0, emptySpanM: 0, emptySpanS: 0,
                    columnsXL: 2, columnsL: 2, columnsM: 2,
                    singleContainerFullSize: false,
                    content: [
                        // --- CỘT 1: THÔNG TIN CHUNG ---
                        new sap.ui.core.Title({ text: "Thông tin chung" }),

                        new sap.m.Label({ text: "Ngày thực hiện", required: true }),
                        new sap.m.DatePicker({
                            value: {
                                path: "new>/log_date",
                                type: "sap.ui.model.type.Date",
                                formatOptions: { pattern: "dd/MM/yyyy" }
                            },
                            displayFormat: "dd/MM/yyyy"
                        }),

                        new sap.m.Label({ text: "Hạng mục (WBS)", required: true }),
                        new sap.m.ComboBox({
                            width: "100%",
                            selectedKey: "{new>/wbs_id}",
                            items: {
                                path: "dailyLogModel>/MasterData/ZWBS",
                                template: new sap.ui.core.Item({ key: "{dailyLogModel>wbs_id}", text: "{dailyLogModel>wbs_name}" })
                            }
                        }),

                        new sap.m.Label({ text: "Thời tiết (Sáng)" }),
                        new sap.m.RadioButtonGroup({
                            columns: 3,
                            selectedIndex: "{new>/weather_am_idx}",
                            buttons: [new sap.m.RadioButton({ text: "Nắng" }), new sap.m.RadioButton({ text: "Mát mẻ" }), new sap.m.RadioButton({ text: "Mưa" })]
                        }),

                        new sap.m.Label({ text: "Thời tiết (Chiều)" }),
                        new sap.m.RadioButtonGroup({
                            columns: 3,
                            selectedIndex: "{new>/weather_pm_idx}",
                            buttons: [new sap.m.RadioButton({ text: "Nắng" }), new sap.m.RadioButton({ text: "Mát mẻ" }), new sap.m.RadioButton({ text: "Mưa" })]
                        }),

                        new sap.m.Label({ text: "CBKT" }),
                        new sap.m.Input({ value: "{new>/man_cbkt}", type: "Number", placeholder: "CBKT", layoutData: new sap.ui.layout.GridData({ span: "XL2 L2 M2 S4" }) }),

                        new sap.m.Label({ text: "CN" }),
                        new sap.m.Input({ value: "{new>/man_cn}", type: "Number", placeholder: "CN", layoutData: new sap.ui.layout.GridData({ span: "XL2 L2 M2 S4" }) }),

                        // --- CỘT 2: TÀI NGUYÊN SỬ DỤNG ---
                        new sap.ui.core.Title({ text: "Tài nguyên sử dụng" }),
                        oResourceVBox, // Đưa VBox chứa bảng tài nguyên vào đây

                        // --- DÒNG DƯỚI: CHI TIẾT THỰC HIỆN ---
                        new sap.ui.core.Title({ text: "Chi tiết thực hiện" }),

                        new sap.m.Label({ text: "Mô tả công việc" }),
                        new sap.m.TextArea({ value: "{new>/description}", rows: 4 }),

                        new sap.m.Label({ text: "Note An toàn vệ sinh" }),
                        new sap.m.TextArea({ value: "{new>/note_safety}", rows: 3, placeholder: "Ghi chú về an toàn vệ sinh lao động" }),

                        new sap.m.Label({ text: "Ý kiến tư vấn giám sát" }),
                        new sap.m.TextArea({ value: "{new>/consultant_note}", rows: 3, placeholder: "Ý kiến của tư vấn giám sát" }),

                        new sap.m.Label({ text: "Ý kiến nhà thầu" }),
                        new sap.m.TextArea({ value: "{new>/contractor_note}", rows: 3, placeholder: "Ý kiến của nhà thầu thi công" })
                    ]
                });

                var oDialog = new sap.m.Dialog({
                    title: "Thêm Nhật Ký Thi Công",
                    contentWidth: "1000px", // Mở rộng độ rộng popup để Form hiển thị đẹp 2 cột
                    contentHeight: "80%",
                    content: [oForm], // Chỉ đưa Form vào Dialog
                    beginButton: new sap.m.Button({
                        text: "Lưu", type: "Emphasized",
                        press: function () {
                            var oNewData = oNewModel.getData();
                            if (!oNewData.wbs_id) { sap.m.MessageToast.show("Vui lòng chọn Hạng mục!"); return; }

                            var oWbs = oModel.getProperty("/MasterData/ZWBS").find(function (i) { return i.wbs_id === oNewData.wbs_id; });
                            oNewData.wbs_name = oWbs ? oWbs.wbs_name : "";

                            if (!oNewData.log_id) {
                                var aLogs = oModel.getProperty("/ZLOG_WORK");
                                oNewData.log_id = "LOG" + String(aLogs.length + 1).padStart(3, "0");
                            }

                            var aLogs = oModel.getProperty("/ZLOG_WORK");
                            aLogs.push(oNewData);
                            oModel.setProperty("/ZLOG_WORK", aLogs);

                            oDialog.close();
                            sap.m.MessageToast.show("Thêm thành công!");
                        }
                    }),
                    endButton: new sap.m.Button({ text: "Hủy", press: function () { oDialog.close(); } }),
                    afterClose: function () { oDialog.destroy(); }
                });

                oDialog.setModel(oNewModel, "new");
                oDialog.setModel(oModel, "dailyLogModel");
                oDialog.open();

            } catch (error) {
                console.error("Error in onAddLog:", error);
                sap.m.MessageBox.error("Lỗi khi mở popup: " + error.message);
            }
        },

        // --- CÁC HÀM SỬA / XÓA ---
        onToggleEditMode: function () {
            this.getView().getModel("dailyLogModel").setProperty("/ui/editMode", true);
        },
        onSaveEdit: function () {
            this.getView().getModel("dailyLogModel").setProperty("/ui/editMode", false);
            MessageToast.show("Đã lưu thay đổi!");
        },
        onCancelEdit: function () {
            this.getView().getModel("dailyLogModel").setProperty("/ui/editMode", false);
        },
        onAddResourceInDetail: function () {
            var oTable = this.byId("idDailyLogList");
            var oItem = oTable.getSelectedItem();
            if (!oItem) return;

            var oContext = oItem.getBindingContext("dailyLogModel");
            var aResources = oContext.getProperty("resources") || [];
            aResources.push({ resource_name: "", unit: "", quantity: 0 });
            oContext.getModel().setProperty(oContext.getPath() + "/resources", aResources);
        },
        onDeleteResourceInDetail: function (oEvent) {
            var oItem = oEvent.getParameter("listItem");
            var oResourceContext = oItem.getBindingContext("dailyLogModel");
            var sResourcePath = oResourceContext.getPath();

            // Get parent daily log context
            var aPathParts = sResourcePath.split("/");
            var iResourceIdx = parseInt(aPathParts.pop());
            aPathParts.pop(); // remove "resources"
            var sParentPath = aPathParts.join("/");

            var oModel = this.getView().getModel("dailyLogModel");
            var aResources = oModel.getProperty(sParentPath + "/resources");
            aResources.splice(iResourceIdx, 1);
            oModel.setProperty(sParentPath + "/resources", aResources);
        },
        onDeleteLog: function () {
            var that = this;
            var oTable = this.byId("idDailyLogList");
            var oItem = oTable.getSelectedItem();
            if (!oItem) return;
            MessageBox.confirm("Bạn có chắc muốn xóa nhật ký này?", {
                onClose: function (oAction) {
                    if (oAction === MessageBox.Action.OK) {
                        var sPath = oItem.getBindingContext("dailyLogModel").getPath();
                        var i = parseInt(sPath.split("/").pop());
                        var aData = that.getView().getModel("dailyLogModel").getProperty("/ZLOG_WORK");
                        aData.splice(i, 1);
                        that.getView().getModel("dailyLogModel").setProperty("/ZLOG_WORK", aData);
                        that.getView().getModel("dailyLogModel").setProperty("/ui/isSelected", false);
                        oTable.removeSelections();
                        MessageToast.show("Đã xóa!");
                    }
                }
            });
        },

        // ========== EXCEL IMPORT/EXPORT ==========

        /**
         * Download Excel template
         */
        onDownloadTemplate: function () {
            var that = this;
            this._loadXLSXLibrary().then(function () {
                ExcelHelper.downloadTemplate();
            }).catch(function (error) {
                MessageBox.error("Không thể tải thư viện XLSX: " + error.message);
            });
        },

        /**
         * Import Excel file
         */
        onImportExcel: function () {
            var that = this;

            this._loadXLSXLibrary().then(function () {
                // Tạo HTML5 file input ẩn
                var fileInput = document.createElement('input');
                fileInput.type = 'file';
                fileInput.accept = '.xlsx,.xls';
                fileInput.style.display = 'none';

                fileInput.onchange = function (e) {
                    var file = e.target.files[0];
                    if (!file) return;

                    that.getView().setBusy(true);

                    ExcelHelper.parseExcelFile(file)
                        .then(function (data) {
                            that.getView().setBusy(false);
                            var transformedData = ExcelHelper.transformExcelData(
                                data.dailyLogs,
                                data.resources
                            );
                            that._showPreviewDialog(transformedData);
                        })
                        .catch(function (error) {
                            that.getView().setBusy(false);
                            MessageBox.error("Lỗi khi đọc file Excel:\n" + error.message);
                        });

                    // Xóa input sau khi xử lý xong
                    document.body.removeChild(fileInput);
                };

                // Thêm vào body và trigger click
                document.body.appendChild(fileInput);
                fileInput.click();

            }).catch(function (error) {
                MessageBox.error("Không thể tải thư viện XLSX: " + error.message);
            });
        },

        _showPreviewDialog: function (aImportedData) {
            var that = this;

            if (!aImportedData || aImportedData.length === 0) {
                MessageToast.show("Không có dữ liệu để import!");
                return;
            }

            var oPreviewModel = new JSONModel({ items: aImportedData });

            var oDialog = new Dialog({
                title: "Xem trước dữ liệu Import (" + aImportedData.length + " bản ghi)",
                contentWidth: "95%",
                contentHeight: "85%",
                resizable: true,
                draggable: true,
                content: [
                    new VBox({
                        items: [
                            new Table({
                                growing: true,
                                growingThreshold: 20,
                                width: "100%",
                                mode: "None",
                                columns: [
                                    new Column({ header: new Label({ text: "STT" }), width: "50px" }),
                                    new Column({ header: new Label({ text: "Ngày" }), width: "90px" }),
                                    new Column({ header: new Label({ text: "WBS" }), width: "140px" }),
                                    new Column({ header: new Label({ text: "Thời tiết S/C" }), width: "100px" }),
                                    new Column({ header: new Label({ text: "Nhân lực" }), width: "75px" }),
                                    new Column({ header: new Label({ text: "Máy móc thiết bị" }), width: "190px" }),
                                    new Column({ header: new Label({ text: "Mô tả" }), width: "180px" }),
                                    new Column({ header: new Label({ text: "Note ATVS" }), width: "160px" }),
                                    new Column({ header: new Label({ text: "Ý kiến TVGS" }), width: "160px" }),
                                    new Column({ header: new Label({ text: "Ý kiến NCC" }), width: "160px" }),
                                    new Column({ header: new Label({ text: "Thao tác" }), width: "120px", hAlign: "Center" })
                                ],
                                items: {
                                    path: "preview>/items",
                                    template: new ColumnListItem({
                                        cells: [
                                            new Text({
                                                text: "{= ${preview>index} !== undefined ? ${preview>index} + 1 : '' }"
                                            }),
                                            new Text({
                                                text: "{path: 'preview>log_date', type: 'sap.ui.model.type.Date', formatOptions: {pattern: 'dd/MM/yyyy'}}"
                                            }),
                                            new VBox({
                                                items: [
                                                    new Text({ text: "{preview>wbs_id}", wrapping: false }),
                                                    new Text({ text: "{preview>wbs_name}", wrapping: false })
                                                ]
                                            }),
                                            new VBox({
                                                items: [
                                                    new Text({
                                                        text: "{= 'S: ' + (${preview>weather_am_idx} === 0 ? 'Nắng' : (${preview>weather_am_idx} === 1 ? 'Mát' : 'Mưa')) }"
                                                    }),
                                                    new Text({
                                                        text: "{= 'C: ' + (${preview>weather_pm_idx} === 0 ? 'Nắng' : (${preview>weather_pm_idx} === 1 ? 'Mát' : 'Mưa')) }"
                                                    })
                                                ]
                                            }),
                                            new VBox({
                                                items: [
                                                    new Text({ text: "CBKT: {preview>man_cbkt}" }),
                                                    new Text({ text: "CN: {preview>man_cn}" })
                                                ]
                                            }),
                                            new VBox({
                                                items: {
                                                    path: "preview>resources",
                                                    template: new Text({
                                                        text: "{= ${preview>resource_name} + ': ' + ${preview>quantity} + ' ' + ${preview>unit} }",
                                                        wrapping: false
                                                    }),
                                                    templateShareable: false
                                                }
                                            }),
                                            new Text({ text: "{preview>description}", wrapping: true, maxLines: 3 }),
                                            new Text({ text: "{preview>note_safety}", wrapping: true, maxLines: 3 }),
                                            new Text({ text: "{preview>consultant_note}", wrapping: true, maxLines: 3 }),
                                            new Text({ text: "{preview>contractor_note}", wrapping: true, maxLines: 3 }),
                                            new HBox({
                                                justifyContent: "Center",
                                                items: [
                                                    new Button({
                                                        icon: "sap-icon://edit",
                                                        type: "Transparent",
                                                        tooltip: "Sửa",
                                                        press: function (oEvent) {
                                                            var oContext = oEvent.getSource().getBindingContext("preview");
                                                            that._editPreviewItem(oContext, oPreviewModel);
                                                        }
                                                    }),
                                                    new Button({
                                                        icon: "sap-icon://delete",
                                                        type: "Transparent",
                                                        tooltip: "Xóa",
                                                        press: function (oEvent) {
                                                            var oContext = oEvent.getSource().getBindingContext("preview");
                                                            that._deletePreviewItem(oContext, oPreviewModel, oDialog);
                                                        }
                                                    })
                                                ]
                                            })
                                        ]
                                    })
                                }
                            })
                        ]
                    })
                ],
                beginButton: new Button({
                    text: "Lưu ({0} bản ghi)".replace("{0}", aImportedData.length),
                    type: "Emphasized",
                    icon: "sap-icon://save",
                    press: function () {
                        var aCurrentData = oPreviewModel.getProperty("/items");
                        if (aCurrentData.length === 0) {
                            MessageToast.show("Không có dữ liệu để lưu!");
                            return;
                        }
                        that._saveImportedData(aCurrentData);
                        oDialog.close();
                    }
                }),
                endButton: new Button({
                    text: "Hủy",
                    press: function () {
                        oDialog.close();
                    }
                }),
                afterClose: function () {
                    oDialog.destroy();
                }
            });

            // Add index to each item for display
            aImportedData.forEach(function (item, index) {
                item.index = index;
            });

            oDialog.setModel(oPreviewModel, "preview");
            oDialog.open();
        },

        _saveImportedData: function (aImportedData) {
            var oModel = this.getView().getModel("dailyLogModel");
            var aCurrentLogs = oModel.getProperty("/ZLOG_WORK");
            var aNewLogs = aImportedData.concat(aCurrentLogs);
            oModel.setProperty("/ZLOG_WORK", aNewLogs);
            MessageToast.show("Đã import thành công " + aImportedData.length + " bản ghi!");
        },

        /**
         * Edit preview item
         */
        _editPreviewItem: function (oContext, oPreviewModel) {
            var that = this;
            var sPath = oContext.getPath();
            var oItem = oContext.getObject();

            console.log("Editing item:", oItem);

            // Clone item for editing - ensure resources is an array and convert date
            var oItemCopy = JSON.parse(JSON.stringify(oItem));

            // Convert date string back to Date object if needed
            if (oItemCopy.log_date && typeof oItemCopy.log_date === "string") {
                oItemCopy.log_date = new Date(oItemCopy.log_date);
            } else if (oItemCopy.log_date && typeof oItemCopy.log_date === "object" && oItemCopy.log_date.__edmType) {
                // Handle OData date format
                oItemCopy.log_date = new Date(oItemCopy.log_date);
            }

            if (!oItemCopy.resources) {
                oItemCopy.resources = [];
            }

            var oEditModel = new JSONModel(oItemCopy);

            console.log("Edit model data:", oEditModel.getData());

            // Create resources table
            var oResourcesTable = new Table({
                growing: false,
                width: "100%",
                mode: "Delete",
                delete: function (oEvent) {
                    var oItem = oEvent.getParameter("listItem");
                    var iIndex = oResourcesTable.indexOfItem(oItem);
                    var aResources = oEditModel.getProperty("/resources");
                    aResources.splice(iIndex, 1);
                    oEditModel.setProperty("/resources", aResources);
                },
                columns: [
                    new Column({ header: new Label({ text: "Tên tài nguyên", required: true }), width: "40%" }),
                    new Column({ header: new Label({ text: "Đơn vị" }), width: "30%" }),
                    new Column({ header: new Label({ text: "Số lượng", required: true }), width: "30%" })
                ],
                items: {
                    path: "edit>/resources",
                    template: new ColumnListItem({
                        cells: [
                            new Input({ value: "{edit>resource_name}", required: true }),
                            new Input({ value: "{edit>unit}" }),
                            new Input({ value: "{edit>quantity}", type: "Number", required: true })
                        ]
                    })
                }
            });

            var oAddResourceBtn = new Button({
                text: "Thêm tài nguyên",
                icon: "sap-icon://add",
                press: function () {
                    var aResources = oEditModel.getProperty("/resources");
                    aResources.push({ resource_name: "", unit: "", quantity: 0 });
                    oEditModel.setProperty("/resources", aResources);
                }
            });

            var oForm = new SimpleForm({
                editable: true,
                layout: "ResponsiveGridLayout",
                labelSpanXL: 4, labelSpanL: 4, labelSpanM: 4,
                adjustLabelSpan: false,
                columnsXL: 2, columnsL: 2, columnsM: 2,
                content: [
                    new Title({ text: "Thông tin chung" }),

                    new Label({ text: "Mã nhật ký" }),
                    new Input({ value: "{edit>/log_id}", placeholder: "VD: LOG001" }),

                    new Label({ text: "Ngày báo cáo" }),
                    new DatePicker({
                        value: {
                            path: "edit>/log_date",
                            type: "sap.ui.model.type.Date",
                            formatOptions: { pattern: "dd/MM/yyyy" }
                        },
                        displayFormat: "dd/MM/yyyy"
                    }),

                    new Label({ text: "Mã WBS" }),
                    new Input({ value: "{edit>/wbs_id}" }),

                    new Label({ text: "Tên hạng mục" }),
                    new Input({ value: "{edit>/wbs_name}" }),

                    new Label({ text: "Thời tiết (Sáng)" }),
                    new RadioButtonGroup({
                        columns: 3,
                        selectedIndex: "{edit>/weather_am_idx}",
                        buttons: [
                            new RadioButton({ text: "Nắng" }),
                            new RadioButton({ text: "Mát mẻ" }),
                            new RadioButton({ text: "Mưa" })
                        ]
                    }),

                    new Label({ text: "Thời tiết (Chiều)" }),
                    new RadioButtonGroup({
                        columns: 3,
                        selectedIndex: "{edit>/weather_pm_idx}",
                        buttons: [
                            new RadioButton({ text: "Nắng" }),
                            new RadioButton({ text: "Mát mẻ" }),
                            new RadioButton({ text: "Mưa" })
                        ]
                    }),

                    new Label({ text: "CBKT" }),
                    new Input({ value: "{edit>/man_cbkt}", type: "Number" }),

                    new Label({ text: "CN" }),
                    new Input({ value: "{edit>/man_cn}", type: "Number" }),

                    new Title({ text: "Chi tiết thực hiện" }),

                    new Label({ text: "Mô tả công việc" }),
                    new TextArea({ value: "{edit>/description}", rows: 3 }),

                    new Label({ text: "Note An toàn vệ sinh" }),
                    new TextArea({ value: "{edit>/note_safety}", rows: 2 }),

                    new Label({ text: "Ý kiến tư vấn giám sát" }),
                    new TextArea({ value: "{edit>/consultant_note}", rows: 2 }),

                    new Label({ text: "Ý kiến nhà thầu" }),
                    new TextArea({ value: "{edit>/contractor_note}", rows: 2 })
                ]
            });

            var oEditDialog = new Dialog({
                title: "Chỉnh sửa dữ liệu",
                contentWidth: "900px",
                contentHeight: "80%",
                verticalScrolling: true,
                content: [
                    oForm,
                    new Label({ text: "Tài nguyên sử dụng", design: "Bold" }),
                    oAddResourceBtn,
                    oResourcesTable
                ],
                beginButton: new Button({
                    text: "Lưu",
                    type: "Emphasized",
                    press: function () {
                        var oEditedItem = oEditModel.getData();
                        oPreviewModel.setProperty(sPath, oEditedItem);
                        MessageToast.show("Đã cập nhật!");
                        oEditDialog.close();
                    }
                }),
                endButton: new Button({
                    text: "Hủy",
                    press: function () {
                        oEditDialog.close();
                    }
                }),
                afterClose: function () {
                    oEditDialog.destroy();
                }
            });

            console.log("Opening edit dialog...");
            oEditDialog.setModel(oEditModel, "edit");
            oEditDialog.open();
            console.log("Edit dialog opened");
        },

        /**
         * Delete preview item
         */
        _deletePreviewItem: function (oContext, oPreviewModel, oParentDialog) {
            var that = this;
            var sPath = oContext.getPath();
            var iIndex = parseInt(sPath.split("/").pop());

            MessageBox.confirm("Bạn có chắc muốn xóa bản ghi này khỏi danh sách import?", {
                onClose: function (oAction) {
                    if (oAction === MessageBox.Action.OK) {
                        var aItems = oPreviewModel.getProperty("/items");
                        aItems.splice(iIndex, 1);

                        // Re-index
                        aItems.forEach(function (item, index) {
                            item.index = index;
                        });

                        oPreviewModel.setProperty("/items", aItems);

                        // Update dialog title
                        oParentDialog.setTitle("Xem trước dữ liệu Import (" + aItems.length + " bản ghi)");

                        MessageToast.show("Đã xóa bản ghi!");
                    }
                }
            });
        },

        _loadXLSXLibrary: function () {
            return new Promise(function (resolve, reject) {
                if (window.XLSX) {
                    resolve();
                    return;
                }
                var script = document.createElement('script');
                script.src = 'https://cdn.sheetjs.com/xlsx-latest/package/dist/xlsx.full.min.js';
                script.onload = function () {
                    resolve();
                };
                script.onerror = function () {
                    reject(new Error("Không thể tải thư viện XLSX từ CDN"));
                };
                document.head.appendChild(script);
            });
        }
>>>>>>> 6aaffacac893a844e0765a765775f89e6b939cfe
    });

    // Mix in DailyLogDelegate functions
    Object.assign(WBSDetailController.prototype, {
        _bindDailyLogList: DailyLogDelegate._bindDailyLogList,
        onLogItemSelect: DailyLogDelegate.onLogItemSelect,
        onLogRowPress: DailyLogDelegate.onLogRowPress,
        _showLogDetail: DailyLogDelegate._showLogDetail,
        _loadResourceUse: DailyLogDelegate._loadResourceUse,
        onAddLog: DailyLogDelegate.onAddLog,
        onExportExcel: DailyLogDelegate.onExportExcel,
        onDownloadTemplate: DailyLogDelegate.onDownloadTemplate,
        onImportExcel: DailyLogDelegate.onImportExcel,
        _openImportPreviewDialog: DailyLogDelegate._openImportPreviewDialog,
        onImportPreviewSelectAll: DailyLogDelegate.onImportPreviewSelectAll,
        onImportPreviewDeselectAll: DailyLogDelegate.onImportPreviewDeselectAll,
        onConfirmImport: DailyLogDelegate.onConfirmImport,
        onCancelImport: DailyLogDelegate.onCancelImport,
        formatImportDate: DailyLogDelegate.formatImportDate,
        _importLogsSequentially: DailyLogDelegate._importLogsSequentially,
        onDeleteLog: DailyLogDelegate.onDeleteLog,
        onDeleteMultipleLogs: DailyLogDelegate.onDeleteMultipleLogs,
        onToggleEditMode: DailyLogDelegate.onToggleEditMode,
        onCancelEdit: DailyLogDelegate.onCancelEdit,
        onAddResourceUse: DailyLogDelegate.onAddResourceUse,
        onDeleteResourceUse: DailyLogDelegate.onDeleteResourceUse,
        onResourceIdChange: DailyLogDelegate.onResourceIdChange,
        onSaveLog: DailyLogDelegate.onSaveLog,
        _persistLog: DailyLogDelegate._persistLog,
        _saveResourceUse: DailyLogDelegate._saveResourceUse,
        _updateWbsActualDates: DailyLogDelegate._updateWbsActualDates
    });

    // Mix in WorkSummaryDelegate functions to the controller prototype so XML views can resolve them during parsing
    Object.assign(WBSDetailController.prototype, {
        _loadWorkSummary: WorkSummaryDelegate._loadWorkSummary,
        formatPercentage: WorkSummaryDelegate.formatPercentage,
        formatProgress: WorkSummaryDelegate.formatProgress,
        formatQuantityState: WorkSummaryDelegate.formatQuantityState,
        formatProgressDisplay: WorkSummaryDelegate.formatProgressDisplay,
        formatTotalQty: WorkSummaryDelegate.formatTotalQty,
        formatWorkSummaryStatusState: WorkSummaryDelegate.formatWorkSummaryStatusState,
        formatWorkSummaryStatusIcon: WorkSummaryDelegate.formatWorkSummaryStatusIcon,
        onSubmitForApproval: WorkSummaryDelegate.onSubmitForApproval
    });

    // Mix in ApprovalLogDelegate functions to the controller prototype
    Object.assign(WBSDetailController.prototype, {
        onLogSelectionChange: ApprovalLogDelegate.onLogSelectionChange,
        formatApprovalActionText: ApprovalLogDelegate.formatApprovalActionText,
        formatApprovalActionState: ApprovalLogDelegate.formatApprovalActionState,
        formatApprovalActionIcon: ApprovalLogDelegate.formatApprovalActionIcon,
        onCloseApprovalDocument: ApprovalLogDelegate.onCloseApprovalDocument,
        _bindApprovalLogList: ApprovalLogDelegate._bindApprovalLogList,
        _initInvestorCanvas: ApprovalLogDelegate._initInvestorCanvas
    });

    return WBSDetailController;
});