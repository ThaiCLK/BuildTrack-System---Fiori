sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/core/routing/History",
    "sap/ui/model/json/JSONModel"
], function (Controller, History, JSONModel) {
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
        }
    });
});