sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/core/routing/History",
    "z/bts/buildtrack/controller/delegate/WBSDelegate",
    "sap/ui/model/json/JSONModel",
    "sap/ui/core/format/DateFormat" // Import thêm để dùng cho formatDate
], function (Controller, History, WBSDelegate, JSONModel, DateFormat) {
    "use strict";

    return Controller.extend("z.bts.buildtrack.controller.SiteDetail", {

        onInit: function () {
            this._oWBSDelegate = new WBSDelegate(this);

            var oRouter = this.getOwnerComponent().getRouter();
            oRouter.getRoute("SiteDetail").attachPatternMatched(this._onObjectMatched, this);

            this.getView().setModel(new JSONModel(), "viewData");
            this.getView().setModel(new JSONModel(), "viewConfig");
        },

        _onObjectMatched: function (oEvent) {
            var sSiteId = oEvent.getParameter("arguments").site_id;
            var oModel = this.getOwnerComponent().getModel();
            var that = this;

            // 1. Bind thông tin Site Detail
            this.getView().bindElement("/zbt_site(guid'" + sSiteId + "')");

            // 2. Nạp dữ liệu WBS
            oModel.read("/zbt_wbs", {
                filters: [new sap.ui.model.Filter("site_id", "EQ", sSiteId)],
                success: function (oData) {
                    // Logic transform cây có thể để ở đây hoặc chuyển vào Delegate cho gọn
                    var aTreeData = that._transformToTree(oData.results);

                    // Delegate tính toán ngày tháng Gantt
                    var oGanttConfig = that._oWBSDelegate.prepareGanttData(aTreeData);

                    that.getView().getModel("viewData").setProperty("/WBS", aTreeData);
                    that.getView().getModel("viewConfig").setData(oGanttConfig);
                }
            });
        },

        onNavBack: function () {
            var oHistory = History.getInstance();
            var sPreviousHash = oHistory.getPreviousHash();

            if (sPreviousHash !== undefined) {
                window.history.go(-1);
            } else {
                var oCtx = this.getView().getBindingContext();
                var sProjectId = oCtx ? oCtx.getProperty("project_id") : "";

                this.getOwnerComponent().getRouter().navTo("Site", {
                    project_id: sProjectId
                }, true);
            }
        },

        _transformToTree: function (aData) {
            var map = {}, node, res = [], i;
            for (i = 0; i < aData.length; i++) {
                map[aData[i].wbs_id] = i;
                aData[i].children = [];
            }
            for (i = 0; i < aData.length; i++) {
                node = aData[i];
                // Check parent_id khác rỗng và tồn tại trong map
                if (node.parent_id && map[node.parent_id] !== undefined) {
                    aData[map[node.parent_id]].children.push(node);
                } else {
                    res.push(node);
                }
            }
            return res;
        },

        /* =========================================================== */
        /* FORMATTERS (Cầu nối giữa XML View và Logic trong Delegate)  */
        /* =========================================================== */

        // 1. Thêm hàm này: Check Node Cha
        isRootNode: function (vParentId) {
            return this._oWBSDelegate.isRootNode(vParentId);
        },

        // 2. Thêm hàm này: Check Node Con
        isChildNode: function (vParentId) {
            return this._oWBSDelegate.isChildNode(vParentId);
        },

        // 3. Các hàm cũ giữ nguyên
        calcMargin: function (sDate) {
            return this._oWBSDelegate.calcMargin(sDate);
        },

        calcWidth: function (sStart, sEnd) {
            return this._oWBSDelegate.calcWidth(sStart, sEnd);
        },

        formatDate: function (oDate) {
            // Nên dùng hàm có sẵn trong Delegate nếu có, hoặc viết tại đây
            if (!oDate) return "";
            var oDateFormat = DateFormat.getInstance({ pattern: "dd/MM/yyyy" });
            return oDateFormat.format(oDate);
        },

        formatLabelNC: function (sQuantity) {
            // 1. Kiểm tra nếu không có dữ liệu hoặc bằng 0 thì không hiện
            if (!sQuantity || sQuantity === "0" || sQuantity === "0.000") {
                return "";
            }

            // 2. Chuyển đổi từ chuỗi "15.000" sang số nguyên 15
            // parseInt sẽ tự động bỏ qua phần thập phân
            var iQuantity = parseInt(sQuantity, 10);

            // 3. Trả về chuỗi định dạng
            // Kết quả sẽ là: "NC [15]" thay vì "NC [15.000]"
            return "NC [" + iQuantity + "]";
        },

        // Sự kiện click
        /* Hàm onGanttTaskClick */
        onGanttTaskClick: function (oEvent) {
            var oContext = oEvent.getParameter("rowBindingContext");
            if (!oContext) return;

            var sWbsId = oContext.getProperty("wbs_id");

            // Lấy site_id. 
            // CÁCH 1: Nếu trong dòng dữ liệu JSON của bảng có trường site_id/project_id
            var sSiteId = oContext.getProperty("site_id"); // hoặc "project_id" tuỳ dữ liệu của bạn

            // CÁCH 2 (An toàn hơn): Nếu đang đứng ở trang SiteDetail, lấy ID từ URL hiện tại
            // var sSiteId = this.getOwnerComponent().getRouter().getHashChanger().getHash().split("/")[1]; 

            this.getOwnerComponent().getRouter().navTo("WBSDetail", {
                site_id: sSiteId, // <--- Truyền thêm cái này
                wbsId: sWbsId
            });
        }
    });
});