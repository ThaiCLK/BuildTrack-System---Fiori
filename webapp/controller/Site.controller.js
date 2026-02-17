sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/core/routing/History"
], function (Controller, History) {
    "use strict";

    return Controller.extend("z.bts.buildtrack.controller.Site", {
        
        /**
         * Khởi tạo Controller
         */
        onInit: function () {
            var oRouter = this.getOwnerComponent().getRouter();
            // Lắng nghe mỗi khi route "Site" được gọi để bind dữ liệu Project
            oRouter.getRoute("Site").attachPatternMatched(this._onObjectMatched, this);
        },

        /**
         * Xử lý mỗi khi URL khớp với pattern Project/{project_id}
         * @param {sap.ui.base.Event} oEvent 
         */
        _onObjectMatched: function (oEvent) {
            var sProjectId = oEvent.getParameter("arguments").project_id;
            var oView = this.getView();

            // Bind dữ liệu Project và expand sang danh sách Sites
            oView.bindElement({
                path: "/zbt_project(guid'" + sProjectId + "')",
                parameters: {
                    expand: "to_Sites" // Lấy danh sách Sites liên quan đến Project này
                }
            });
        },

        /**
         * Xử lý điều hướng khi bấm vào một dòng Site trong bảng
         * @param {sap.ui.base.Event} oEvent 
         */
        onSitePress: function (oEvent) {
            // Lấy context của dòng (Site) vừa bấm
            var oItem = oEvent.getSource();
            var oCtx = oItem.getBindingContext();
            
            if (!oCtx) {
                return;
            }

            var sSiteId = oCtx.getProperty("site_id");

            // Lấy Router của Component và điều hướng sang SiteDetail
            var oRouter = this.getOwnerComponent().getRouter();
            oRouter.navTo("SiteDetail", {
                site_id: sSiteId
            });
        },

        /**
         * Quay lại màn hình trước đó
         */
        onNavBack: function () {
            var oHistory = History.getInstance();
            var sPreviousHash = oHistory.getPreviousHash();

            if (sPreviousHash !== undefined) {
                // Quay lại trang trước trong lịch sử trình duyệt
                window.history.go(-1);
            } else {
                // Nếu không có lịch sử, quay về màn hình chính (Project Management)
                this.getOwnerComponent().getRouter().navTo("RouteMain", {}, true);
            }
        }
    });
});