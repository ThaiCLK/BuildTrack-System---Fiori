sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/m/MessageToast"
],
    /**
     * @param {typeof sap.ui.core.mvc.Controller} Controller
     */
    function (Controller, Filter, FilterOperator, MessageToast) {
        "use strict";

        return Controller.extend("z.bts.buildtrack.controller.ProjectManagement", { // ⚠️ LƯU Ý: Tên này phải trùng với controllerName trong XML

            onInit: function () {
                // Hàm này chạy đầu tiên khi màn hình load
                // Dữ liệu sẽ tự động được OData Model lấy về, không cần code ở đây
            },

            /**
             * Xử lý khi người dùng gõ vào ô tìm kiếm
             */
            onSearch: function (oEvent) {
                // 1. Lấy từ khóa người dùng nhập
                var sQuery = oEvent.getParameter("query");
                var aFilters = [];

                if (sQuery && sQuery.length > 0) {
                    // 2. Tạo bộ lọc: Tìm theo Tên dự án (project_name) HOẶC Mã dự án (project_code)
                    var oFilterName = new Filter("project_name", FilterOperator.Contains, sQuery);
                    var oFilterCode = new Filter("project_code", FilterOperator.Contains, sQuery);

                    // Kết hợp 2 điều kiện bằng OR (tìm thấy ở tên hoặc mã đều được)
                    aFilters.push(new Filter({
                        filters: [oFilterName, oFilterCode],
                        and: false
                    }));
                }

                // 3. Lấy binding của bảng và áp dụng filter
                var oTable = this.byId("projectTable");
                var oBinding = oTable.getBinding("items");
                oBinding.filter(aFilters);
            },

            /**
 * Xử lý khi bấm vào một dòng trong bảng để điều hướng tới Site
 */
            onPressProject: function (oEvent) {
                // 1. Lấy dòng được bấm
                var oItem = oEvent.getSource();

                // 2. Lấy Context của dòng đó
                var oContext = oItem.getBindingContext();

                // 3. Lấy project_id (Kiểu GUID từ JSON bạn đã tạo)
                var sProjectId = oContext.getProperty("project_id");

                // 4. Lấy Router của ứng dụng
                var oRouter = this.getOwnerComponent().getRouter();

                // 5. Thực hiện điều hướng tới route "ProjectDetail"
                // Tham số project_id phải khớp với cấu hình pattern trong manifest.json
                oRouter.navTo("Site", {
                    project_id: sProjectId
                });

                // (Tùy chọn) Hiện thông báo để người dùng biết đang chuyển trang
                var sProjectName = oContext.getProperty("project_name");
                sap.m.MessageToast.show("Đang mở danh sách Site cho: " + sProjectName);
            },

            /**
             * Xử lý nút Tạo mới
             */
            onPressCreate: function () {
                MessageToast.show("Chức năng Tạo dự án sẽ được phát triển sau.");
            }
        });
    });