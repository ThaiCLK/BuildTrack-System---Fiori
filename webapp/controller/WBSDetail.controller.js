sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/core/routing/History",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "sap/m/Dialog",
    "sap/m/Button",
    "sap/m/Label",
    "sap/m/Input",
    "sap/m/DatePicker",
    "sap/m/TextArea",
    "sap/m/ComboBox",
    "sap/m/RadioButton",
    "sap/m/RadioButtonGroup",
    "sap/ui/core/Item",
    "sap/ui/core/Title",
    "sap/ui/layout/form/SimpleForm",
    "sap/ui/layout/GridData",
    "sap/m/VBox",
    "sap/m/HBox",
    "sap/m/Table",
    "sap/m/Column",
    "sap/m/ColumnListItem",
    "sap/m/Text",
    "sap/ui/core/Fragment",
    "z/bts/buildtrack/utils/ExcelHelper"
], function (Controller, History, JSONModel, MessageToast, MessageBox, Dialog, Button, Label, Input, DatePicker, TextArea, ComboBox, RadioButton, RadioButtonGroup, Item, Title, SimpleForm, GridData, VBox, HBox, Table, Column, ColumnListItem, Text, Fragment, ExcelHelper) {
    "use strict";

    return Controller.extend("z.bts.buildtrack.controller.WBSDetail", {

        /**
         * Hàm khởi tạo
         */
        onInit: function () {
            // 1. Lấy Router từ Component
            var oRouter = this.getOwnerComponent().getRouter();

            // 2. Lắng nghe route "WBSDetail" (tên đã khai báo trong manifest.json)
            oRouter.getRoute("WBSDetail").attachPatternMatched(this._onObjectMatched, this);

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

        /**
         * Xử lý khi Route khớp (Trang được load)
         * @param {sap.ui.base.Event} oEvent
         */
        _onObjectMatched: function (oEvent) {
            // 1. Lấy ID từ URL (được truyền từ trang trước)
            var sWbsId = oEvent.getParameter("arguments").wbsId;

            // 2. Tạo đường dẫn (Path) tới Entity trong OData
            // Giả sử EntitySet của bạn tên là "zbt_wbs"
            // Cú pháp chuẩn OData V2: /EntitySet('Key')
            var sObjectPath = "/zbt_wbs('" + sWbsId + "')";

            // 3. Thực hiện Bind Element cho View
            this.getView().bindElement({
                path: sObjectPath,
                events: {
                    change: this._onBindingChange.bind(this), // (Tuỳ chọn) Gọi khi binding xong
                    dataRequested: function () {
                        // (Tuỳ chọn) Hiện BusyIndicator khi đang tải
                        this.getView().setBusy(true);
                    }.bind(this),
                    dataReceived: function () {
                        // (Tuỳ chọn) Tắt BusyIndicator khi tải xong
                        this.getView().setBusy(false);
                    }.bind(this)
                }
            });
        },
        _onBindingChange: function () {
            var oView = this.getView();
            var oElementBinding = oView.getElementBinding();

            // Nếu không tìm thấy dữ liệu (ví dụ ID sai) thì chuyển trang báo lỗi
            if (!oElementBinding.getBoundContext()) {
                // this.getOwnerComponent().getRouter().getTargets().display("objectNotFound");
                return;
            }
        },

        /**
         * Hàm quay lại trang trước (Back button)
         */
        onNavBack: function () {
            var oHistory = History.getInstance();
            var sPreviousHash = oHistory.getPreviousHash();

            // Nếu có lịch sử thì Back như bình thường
            if (sPreviousHash !== undefined) {
                window.history.go(-1);
            } else {
                // Nếu F5 mất lịch sử, dùng site_id đã lưu để điều hướng chính xác
                var oRouter = this.getOwnerComponent().getRouter();

                // Kiểm tra an toàn
                if (this._sParentSiteId) {
                    oRouter.navTo("SiteDetail", {
                        site_id: this._sParentSiteId
                    }, true);
                } else {
                    // Trường hợp xấu nhất không tìm thấy ID cha, về trang chủ
                    oRouter.navTo("RouteMain", {}, true);
                }
            }
        },

        // ==================== DAILY LOG FUNCTIONS ====================

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

            var oEditModel = new sap.ui.model.json.JSONModel(oItemCopy);

            console.log("Edit model data:", oEditModel.getData());

            // 1. Tạo nút Thêm tài nguyên (Add Resource Button)
            var oAddResourceBtn = new sap.m.Button({
                text: "Thêm tài nguyên",
                icon: "sap-icon://add",
                type: "Transparent",
                press: function () {
                    var aResources = oEditModel.getProperty("/resources");
                    aResources.push({ resource_name: "", unit: "", quantity: 0 });
                    oEditModel.setProperty("/resources", aResources);
                }
            });

            // 2. Tạo Bảng tài nguyên (Resources Table)
            var oResourcesTable = new sap.m.Table({
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
                    new sap.m.Column({ width: "45%", header: new sap.m.Text({ text: "Tên tài nguyên" }) }),
                    new sap.m.Column({ width: "30%", header: new sap.m.Text({ text: "Đơn vị" }) }),
                    new sap.m.Column({ width: "25%", header: new sap.m.Text({ text: "Số lượng" }) })
                ],
                items: {
                    path: "edit>/resources",
                    template: new sap.m.ColumnListItem({
                        cells: [
                            new sap.m.Input({ value: "{edit>resource_name}", required: true }),
                            new sap.m.Input({ value: "{edit>unit}" }),
                            new sap.m.Input({ value: "{edit>quantity}", type: "Number", required: true })
                        ]
                    })
                }
            });

            // 3. Gói Nút và Bảng vào VBox (Thiết lập GridData span 12)
            var oResourceVBox = new sap.m.VBox({
                width: "100%",
                layoutData: new sap.ui.layout.GridData({ span: "XL12 L12 M12 S12" }),
                items: [oAddResourceBtn, oResourcesTable]
            });

            // 4. Tạo SimpleForm
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

                    new sap.m.Label({ text: "Mã nhật ký" }),
                    new sap.m.Input({ value: "{edit>/log_id}", placeholder: "VD: LOG001" }),

                    new sap.m.Label({ text: "Ngày báo cáo", required: true }),
                    new sap.m.DatePicker({
                        value: {
                            path: "edit>/log_date",
                            type: "sap.ui.model.type.Date",
                            formatOptions: { pattern: "dd/MM/yyyy" }
                        },
                        displayFormat: "dd/MM/yyyy"
                    }),

                    new sap.m.Label({ text: "Mã WBS" }),
                    new sap.m.Input({ value: "{edit>/wbs_id}" }),

                    new sap.m.Label({ text: "Tên hạng mục" }),
                    new sap.m.Input({ value: "{edit>/wbs_name}" }),

                    new sap.m.Label({ text: "Thời tiết (Sáng)" }),
                    new sap.m.RadioButtonGroup({
                        columns: 3,
                        selectedIndex: "{edit>/weather_am_idx}",
                        buttons: [
                            new sap.m.RadioButton({ text: "Nắng" }),
                            new sap.m.RadioButton({ text: "Mát mẻ" }),
                            new sap.m.RadioButton({ text: "Mưa" })
                        ]
                    }),

                    new sap.m.Label({ text: "Thời tiết (Chiều)" }),
                    new sap.m.RadioButtonGroup({
                        columns: 3,
                        selectedIndex: "{edit>/weather_pm_idx}",
                        buttons: [
                            new sap.m.RadioButton({ text: "Nắng" }),
                            new sap.m.RadioButton({ text: "Mát mẻ" }),
                            new sap.m.RadioButton({ text: "Mưa" })
                        ]
                    }),

                    new sap.m.Label({ text: "CBKT" }),
                    new sap.m.Input({ value: "{edit>/man_cbkt}", type: "Number", layoutData: new sap.ui.layout.GridData({ span: "XL2 L2 M2 S4" }) }),

                    new sap.m.Label({ text: "CN" }),
                    new sap.m.Input({ value: "{edit>/man_cn}", type: "Number", layoutData: new sap.ui.layout.GridData({ span: "XL2 L2 M2 S4" }) }),

                    // --- CỘT 2: TÀI NGUYÊN SỬ DỤNG ---
                    new sap.ui.core.Title({ text: "Tài nguyên sử dụng" }),
                    oResourceVBox, // Đưa VBox chứa bảng tài nguyên vào đây

                    // --- DÒNG DƯỚI: CHI TIẾT THỰC HIỆN ---
                    new sap.ui.core.Title({ text: "Chi tiết thực hiện" }),

                    new sap.m.Label({ text: "Mô tả công việc" }),
                    new sap.m.TextArea({ value: "{edit>/description}", rows: 4 }),

                    new sap.m.Label({ text: "Note An toàn vệ sinh" }),
                    new sap.m.TextArea({ value: "{edit>/note_safety}", rows: 3 }),

                    new sap.m.Label({ text: "Ý kiến tư vấn giám sát" }),
                    new sap.m.TextArea({ value: "{edit>/consultant_note}", rows: 3 }),

                    new sap.m.Label({ text: "Ý kiến nhà thầu" }),
                    new sap.m.TextArea({ value: "{edit>/contractor_note}", rows: 3 })
                ]
            });

            var oEditDialog = new sap.m.Dialog({
                title: "Chỉnh sửa dữ liệu",
                contentWidth: "1000px", // Mở rộng để Form tự động chia 2 cột
                contentHeight: "80%",
                verticalScrolling: true,
                content: [ oForm ], // Chỉ chứa oForm
                beginButton: new sap.m.Button({
                    text: "Lưu",
                    type: "Emphasized",
                    press: function () {
                        var oEditedItem = oEditModel.getData();
                        oPreviewModel.setProperty(sPath, oEditedItem);
                        sap.m.MessageToast.show("Đã cập nhật!");
                        oEditDialog.close();
                    }
                }),
                endButton: new sap.m.Button({
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
    });
});