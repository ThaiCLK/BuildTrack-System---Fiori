sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/core/Fragment",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/m/MessageBox",
    "sap/m/MessageToast"
], function (Controller, Fragment, JSONModel, Filter, FilterOperator, MessageBox, MessageToast) {
    "use strict";

    return Controller.extend("z.bts.buildtrack551.controller.ResourceManagement", {

        /* ================================================================= */
        /*  Lifecycle                                                         */
        /* ================================================================= */
        onInit: function () {
            this._oModel = new JSONModel({
                // Resource dialog
                editMode: false,
                ResourceId: "",
                ResourceName: "",
                ResourceType: "",
                UnitCode: "",
                availableUnits: [],
                // Unit dialog
                unitEditMode: false,
                UnitCode: "",
                UnitName: "",
                UnitStatus: "ACTIVE",

                // --- Pagination & MultiSelect State ---
                pageSize: 10,

                // Resource Tab
                resources: [],
                paginatedResources: [],
                resCurrentPage: 1,
                resTotalPages: 1,
                resCanPrev: false,
                resCanNext: false,
                selectedResCount: 0,
                resSearchQuery: "",

                // Unit Tab
                units: [],
                paginatedUnits: [],
                unitCurrentPage: 1,
                unitTotalPages: 1,
                unitCanPrev: false,
                unitCanNext: false,
                selectedUnitCount: 0,
                unitSearchQuery: ""
            });
            // Mở rộng giới hạn model để ComboBox có thể hiển thị hơn 100 đối tượng (mặc định của UI5 là 100)
            this._oModel.setSizeLimit(1000);
            this.getView().setModel(this._oModel, "resMgmt");

            sap.ui.getCore().getEventBus()
                .subscribe("Global", "RefreshData", this._onRefresh, this);

            // Fetch initial data
            var oModel = this.getOwnerComponent().getModel();
            if (oModel) {
                this._readResources();
                this._readUnits();
            } else {
                // If model not ready, wait for pattern matched
                var oRouter = this.getOwnerComponent().getRouter();
                if (oRouter) {
                    oRouter.getRoute("ResourceManagement").attachPatternMatched(function () {
                        this._readResources();
                        this._readUnits();
                    }, this);
                }
            }
        },

        onExit: function () {
            sap.ui.getCore().getEventBus()
                .unsubscribe("Global", "RefreshData", this._onRefresh, this);
            if (this._oResDialog) { this._oResDialog.destroy(); this._oResDialog = null; }
            if (this._oUnitDialog) { this._oUnitDialog.destroy(); this._oUnitDialog = null; }
        },

        _onRefresh: function () {
            this._readResources();
            this._readUnits();
        },

        onNavBack: function () {
            this.getOwnerComponent().getRouter().navTo("Dashboard");
        },

        /* ================================================================= */
        /*  RESOURCE — Data Reading & Pagination                              */
        /* ================================================================= */
        _readResources: function () {
            var oModel = this.getOwnerComponent().getModel();
            if (!oModel) { return; }
            var that = this;
            oModel.read("/ResourceSet", {
                success: function (oData) {
                    var aResults = oData.results || [];
                    aResults.sort(function (a, b) {
                        return (a.ResourceId || "").localeCompare(b.ResourceId || "");
                    });
                    that._oModel.setProperty("/resources", aResults);
                    that._updateResPagination(1);
                    if (that.byId("resourceTable")) {
                        that.byId("resourceTable").removeSelections(true);
                        that.onResSelectionChange();
                    }
                },
                error: function () {
                    that._oModel.setProperty("/resources", []);
                    that._updateResPagination(1);
                }
            });
        },

        _updateResPagination: function (iPage) {
            var aAll = this._oModel.getProperty("/resources") || [];
            var sQuery = (this._oModel.getProperty("/resSearchQuery") || "").toLowerCase();

            var aFiltered = aAll;
            if (sQuery) {
                aFiltered = aAll.filter(function (r) {
                    var sCode = (r.ResourceId || "").toLowerCase();
                    var sName = (r.ResourceName || "").toLowerCase();
                    var sUnit = (r.UnitCode || "").toLowerCase();
                    return sCode.indexOf(sQuery) !== -1 || sName.indexOf(sQuery) !== -1 || sUnit.indexOf(sQuery) !== -1;
                });
            }

            var iPageSize = this._oModel.getProperty("/pageSize");
            var iTotalPages = Math.ceil(aFiltered.length / iPageSize) || 1;

            if (iPage < 1) { iPage = 1; }
            if (iPage > iTotalPages) { iPage = iTotalPages; }

            var iStart = (iPage - 1) * iPageSize;
            var aPaginated = aFiltered.slice(iStart, iStart + iPageSize);

            this._oModel.setProperty("/resCurrentPage", iPage);
            this._oModel.setProperty("/resTotalPages", iTotalPages);
            this._oModel.setProperty("/paginatedResources", aPaginated);
            this._oModel.setProperty("/resCanPrev", iPage > 1);
            this._oModel.setProperty("/resCanNext", iPage < iTotalPages);
        },

        onSearchResource: function (oEvent) {
            var sQ = (oEvent.getParameter("newValue") || oEvent.getParameter("query") || "").trim();
            this._oModel.setProperty("/resSearchQuery", sQ);
            this._updateResPagination(1);
            this.byId("resourceTable").removeSelections(true);
            this.onResSelectionChange();
        },

        onPrevResPage: function () { this._updateResPagination(this._oModel.getProperty("/resCurrentPage") - 1); },
        onNextResPage: function () { this._updateResPagination(this._oModel.getProperty("/resCurrentPage") + 1); },
        onResSelectionChange: function () {
            var iCount = this.byId("resourceTable").getSelectedItems().length;
            this._oModel.setProperty("/selectedResCount", iCount);
        },

        /* ================================================================= */
        /*  RESOURCE — Create / Edit Dialog                                   */
        /* ================================================================= */
        onOpenCreateResDialog: function () {
            this._loadActiveUnits(function () {
                this._oModel.setProperty("/editMode", false);
                this._oModel.setProperty("/ResourceId", "");
                this._oModel.setProperty("/ResourceName", "");
                this._oModel.setProperty("/ResourceType", "");
                this._oModel.setProperty("/UnitCode", "");
                this._openResDialog();
            }.bind(this));
        },

        onOpenEditResDialog: function () {
            var aSelected = this.byId("resourceTable").getSelectedContexts();
            if (aSelected.length !== 1) { return; }
            var oData = aSelected[0].getObject();
            this._loadActiveUnits(function () {
                this._oModel.setProperty("/editMode", true);
                this._oModel.setProperty("/ResourceId", oData.ResourceId);
                this._oModel.setProperty("/ResourceName", oData.ResourceName);
                this._oModel.setProperty("/ResourceType", oData.ResourceType || "");
                this._oModel.setProperty("/UnitCode", oData.UnitCode || "");
                this._openResDialog();
            }.bind(this));
        },

        _loadActiveUnits: function (fnDone) {
            var oOData = this.getView().getModel();
            oOData.read("/UnitSet", {
                filters: [new Filter("Status", FilterOperator.EQ, "ACTIVE")],
                success: function (oResult) {
                    var aUnits = oResult.results || [];
                    aUnits.sort(function (a, b) {
                        return (a.UnitCode || "").localeCompare(b.UnitCode || "");
                    });
                    this._oModel.setProperty("/availableUnits", aUnits);
                    if (fnDone) { fnDone(); }
                }.bind(this),
                error: function () {
                    this._oModel.setProperty("/availableUnits", []);
                    if (fnDone) { fnDone(); }
                }.bind(this)
            });
        },

        _openResDialog: function () {
            if (this._oResDialog) { this._oResDialog.open(); return; }
            Fragment.load({
                name: "z.bts.buildtrack551.view.fragments.ResourceDialog",
                controller: this
            }).then(function (oD) {
                this._oResDialog = oD;
                this.getView().addDependent(oD);
                oD.open();
            }.bind(this));
        },

        /* ================================================================= */
        /*  RESOURCE — Save                                                   */
        /* ================================================================= */
        onSaveResource: function () {
            var oB = this.getView().getModel("i18n").getResourceBundle();
            var d = this._oModel.getData();

            if (!d.ResourceName || !d.ResourceName.trim()) {
                MessageBox.error(oB.getText("resValName")); return;
            }
            if (d.ResourceName.trim().length > 100) {
                MessageBox.error(oB.getText("resValNameLen")); return;
            }
            if (!d.ResourceType) {
                MessageBox.error(oB.getText("resValType")); return;
            }

            var oCbUnit = sap.ui.getCore().byId("cbUnitCode");
            var sCbValue = oCbUnit ? oCbUnit.getValue().trim() : "";

            if (!d.UnitCode || !d.UnitCode.trim()) {
                if (sCbValue !== "") {
                    MessageBox.error("Mã đơn vị '" + sCbValue + "' không tồn tại trong hệ thống. Vui lòng chọn một mã hợp lệ.");
                } else {
                    MessageBox.error(oB.getText("resValUnit") || "Mã đơn vị không được để trống.");
                }
                return;
            }

            var oPayload = {
                ResourceName: d.ResourceName.trim(),
                ResourceType: d.ResourceType,
                UnitCode: d.UnitCode.trim()
            };

            this.getView().setBusy(true);
            var oOData = this.getView().getModel();

            if (d.editMode) {
                oOData.update("/ResourceSet('" + d.ResourceId + "')", oPayload, {
                    success: function () {
                        this.getView().setBusy(false);
                        MessageToast.show(oB.getText("resUpdatedOk"));
                        this._oResDialog.close();
                        this._readResources();
                    }.bind(this),
                    error: function (e) {
                        this.getView().setBusy(false);
                        this._showErr(e, oB.getText("resUpdatedErr"));
                    }.bind(this)
                });
            } else {
                oOData.create("/ResourceSet", oPayload, {
                    success: function () {
                        this.getView().setBusy(false);
                        MessageToast.show(oB.getText("resCreatedOk"));
                        this._oResDialog.close();
                        this._readResources();
                    }.bind(this),
                    error: function (e) {
                        this.getView().setBusy(false);
                        this._showErr(e, oB.getText("resCreatedErr"));
                    }.bind(this)
                });
            }
        },

        onCancelResource: function () {
            if (this._oResDialog) { this._oResDialog.close(); }
        },

        /* ================================================================= */
        /*  RESOURCE — Delete                                                 */
        /* ================================================================= */
        onDeleteResource: function () {
            var oB = this.getView().getModel("i18n").getResourceBundle();
            var aSelected = this.byId("resourceTable").getSelectedContexts();
            if (aSelected.length === 0) { return; }

            var sConfirmMsg = aSelected.length === 1
                ? oB.getText("resDeleteConfirm", [aSelected[0].getProperty("ResourceName")])
                : "Bạn có chắc muốn xóa " + aSelected.length + " tài nguyên đã chọn?";

            MessageBox.confirm(sConfirmMsg, {
                title: oB.getText("resDeleteTitle"),
                onClose: function (sAction) {
                    if (sAction !== MessageBox.Action.OK) { return; }
                    this.getView().setBusy(true);
                    var oModel = this.getOwnerComponent().getModel();

                    var aPromises = aSelected.map(function (oCtx) {
                        return new Promise(function (resolve) {
                            var sId = oCtx.getProperty("ResourceId");
                            var sName = oCtx.getProperty("ResourceName");
                            oModel.remove("/ResourceSet('" + sId + "')", {
                                changeSetId: "delRes_" + sId, // Tách mỗi request thành 1 changeset riêng
                                success: function () {
                                    resolve({ success: true, id: sId, name: sName });
                                },
                                error: function (e) {
                                    resolve({ success: false, id: sId, name: sName, error: e });
                                }
                            });
                        });
                    });

                    Promise.all(aPromises).then(function (aResults) {
                        this.getView().setBusy(false);

                        var aErrors = [];
                        var iSuccess = 0;
                        aResults.forEach(function (r) {
                            if (r.success) {
                                iSuccess++;
                            } else {
                                var sMsg = "Không thể xóa";
                                try {
                                    if (r.error.responseText) {
                                        var oErr = JSON.parse(r.error.responseText);
                                        if (oErr && oErr.error && oErr.error.message && oErr.error.message.value) {
                                            sMsg = oErr.error.message.value;
                                        }
                                    }
                                } catch (ex) {
                                    if (r.error.message) sMsg = r.error.message;
                                }
                                aErrors.push("- " + r.id + " (" + r.name + "): " + sMsg);
                            }
                        });

                        if (aErrors.length > 0) {
                            var sFinalMsg = "Đã xóa thành công " + iSuccess + " tài nguyên.\nCó " + aErrors.length + " tài nguyên bị lỗi:\n\n" + aErrors.join("\n");
                            MessageBox.error(sFinalMsg);
                        } else {
                            MessageToast.show(oB.getText("resDeletedOk"));
                        }

                        this.byId("resourceTable").removeSelections(true);
                        this._readResources();
                    }.bind(this));
                }.bind(this)
            });
        },

        /* ================================================================= */
        /* ================================================================= */
        /*  UNIT — Data Reading & Pagination                                  */
        /* ================================================================= */
        _readUnits: function () {
            var oModel = this.getOwnerComponent().getModel();
            if (!oModel) { return; }
            var that = this;
            oModel.read("/UnitSet", {
                success: function (oData) {
                    var aResults = oData.results || [];
                    aResults.sort(function (a, b) {
                        return (a.UnitCode || "").localeCompare(b.UnitCode || "");
                    });
                    that._oModel.setProperty("/units", aResults);
                    that._updateUnitPagination(1);
                    if (that.byId("unitTable")) {
                        that.byId("unitTable").removeSelections(true);
                        that.onUnitSelectionChange();
                    }
                },
                error: function () {
                    that._oModel.setProperty("/units", []);
                    that._updateUnitPagination(1);
                }
            });
        },

        _updateUnitPagination: function (iPage) {
            var aAll = this._oModel.getProperty("/units") || [];
            var sQuery = (this._oModel.getProperty("/unitSearchQuery") || "").toLowerCase();

            var aFiltered = aAll;
            if (sQuery) {
                aFiltered = aAll.filter(function (u) {
                    var sCode = (u.UnitCode || "").toLowerCase();
                    var sName = (u.UnitName || "").toLowerCase();
                    return sCode.indexOf(sQuery) !== -1 || sName.indexOf(sQuery) !== -1;
                });
            }

            var iPageSize = this._oModel.getProperty("/pageSize");
            var iTotalPages = Math.ceil(aFiltered.length / iPageSize) || 1;

            if (iPage < 1) { iPage = 1; }
            if (iPage > iTotalPages) { iPage = iTotalPages; }

            var iStart = (iPage - 1) * iPageSize;
            var aPaginated = aFiltered.slice(iStart, iStart + iPageSize);

            this._oModel.setProperty("/unitCurrentPage", iPage);
            this._oModel.setProperty("/unitTotalPages", iTotalPages);
            this._oModel.setProperty("/paginatedUnits", aPaginated);
            this._oModel.setProperty("/unitCanPrev", iPage > 1);
            this._oModel.setProperty("/unitCanNext", iPage < iTotalPages);
        },

        onSearchUnit: function (oEvent) {
            var sQ = (oEvent.getParameter("newValue") || oEvent.getParameter("query") || "").trim();
            this._oModel.setProperty("/unitSearchQuery", sQ);
            this._updateUnitPagination(1);
            this.byId("unitTable").removeSelections(true);
            this.onUnitSelectionChange();
        },

        onPrevUnitPage: function () { this._updateUnitPagination(this._oModel.getProperty("/unitCurrentPage") - 1); },
        onNextUnitPage: function () { this._updateUnitPagination(this._oModel.getProperty("/unitCurrentPage") + 1); },
        onUnitSelectionChange: function () {
            var iCount = this.byId("unitTable").getSelectedItems().length;
            this._oModel.setProperty("/selectedUnitCount", iCount);
        },

        /* ================================================================= */
        /*  UNIT — Create / Edit Dialog                                       */
        /* ================================================================= */
        onOpenCreateUnitDialog: function () {
            this._oModel.setProperty("/unitEditMode", false);
            this._oModel.setProperty("/UnitCode", "");
            this._oModel.setProperty("/UnitName", "");
            this._oModel.setProperty("/UnitStatus", "ACTIVE");
            this._openUnitDialog();
        },

        onOpenEditUnitDialog: function () {
            var aSelected = this.byId("unitTable").getSelectedContexts();
            if (aSelected.length !== 1) { return; }
            var oData = aSelected[0].getObject();
            this._oModel.setProperty("/unitEditMode", true);
            this._oModel.setProperty("/UnitCode", oData.UnitCode);
            this._oModel.setProperty("/UnitName", oData.UnitName);
            this._oModel.setProperty("/UnitStatus", oData.Status || "ACTIVE");
            this._openUnitDialog();
        },

        _openUnitDialog: function () {
            if (this._oUnitDialog) { this._oUnitDialog.open(); return; }
            Fragment.load({
                name: "z.bts.buildtrack551.view.fragments.UnitDialog",
                controller: this
            }).then(function (oD) {
                this._oUnitDialog = oD;
                this.getView().addDependent(oD);
                oD.open();
            }.bind(this));
        },

        /* ================================================================= */
        /*  UNIT — Save                                                       */
        /* ================================================================= */
        onSaveUnit: function () {
            var oB = this.getView().getModel("i18n").getResourceBundle();
            var d = this._oModel.getData();

            if (!d.unitEditMode) {
                if (!d.UnitCode || !d.UnitCode.trim()) {
                    MessageBox.error(oB.getText("unitValCode")); return;
                }
                if (d.UnitCode.trim().length > 3) {
                    MessageBox.error(oB.getText("unitValCodeLen")); return;
                }
            }
            if (!d.UnitName || !d.UnitName.trim()) {
                MessageBox.error(oB.getText("unitValName")); return;
            }
            if (d.UnitName.trim().length > 30) {
                MessageBox.error(oB.getText("unitValNameLen")); return;
            }

            this.getView().setBusy(true);
            var oOData = this.getView().getModel();

            if (d.unitEditMode) {
                oOData.update("/UnitSet('" + d.UnitCode + "')", {
                    UnitCode: d.UnitCode,
                    UnitName: d.UnitName.trim(),
                    Status: d.UnitStatus
                }, {
                    success: function () {
                        this.getView().setBusy(false);
                        MessageToast.show(oB.getText("unitUpdatedOk"));
                        this._oUnitDialog.close();
                        this._readUnits();
                    }.bind(this),
                    error: function (e) {
                        this.getView().setBusy(false);
                        this._showErr(e, oB.getText("unitUpdatedErr"));
                    }.bind(this)
                });
            } else {
                oOData.create("/UnitSet", {
                    UnitCode: d.UnitCode.trim().toUpperCase(),
                    UnitName: d.UnitName.trim(),
                    Status: "ACTIVE"
                }, {
                    success: function () {
                        this.getView().setBusy(false);
                        MessageToast.show(oB.getText("unitCreatedOk"));
                        this._oUnitDialog.close();
                        this._readUnits();
                    }.bind(this),
                    error: function (e) {
                        this.getView().setBusy(false);
                        this._showErr(e, oB.getText("unitCreatedErr"));
                    }.bind(this)
                });
            }
        },

        onCancelUnit: function () {
            if (this._oUnitDialog) { this._oUnitDialog.close(); }
        },

        /* ================================================================= */
        /*  UNIT — Delete                                                     */
        /* ================================================================= */
        onDeleteUnit: function () {
            var oB = this.getView().getModel("i18n").getResourceBundle();
            var aSelected = this.byId("unitTable").getSelectedContexts();
            if (aSelected.length === 0) { return; }

            // Validate all selected must be CUS
            var bAllCus = aSelected.every(function (oCtx) {
                return oCtx.getProperty("UnitType") === "CUS";
            });

            if (!bAllCus) {
                MessageBox.error(oB.getText("unitDeleteNotCus"));
                return;
            }

            var sConfirmMsg = aSelected.length === 1
                ? oB.getText("unitDeleteConfirm", [aSelected[0].getProperty("UnitCode"), aSelected[0].getProperty("UnitName")])
                : "Bạn có chắc muốn xóa " + aSelected.length + " đơn vị tính đã chọn?";

            MessageBox.confirm(sConfirmMsg, {
                title: oB.getText("unitDeleteTitle"),
                onClose: function (sAction) {
                    if (sAction !== MessageBox.Action.OK) { return; }
                    this.getView().setBusy(true);
                    var oModel = this.getOwnerComponent().getModel();

                    var aPromises = aSelected.map(function (oCtx) {
                        return new Promise(function (resolve, reject) {
                            oModel.remove("/UnitSet('" + oCtx.getProperty("UnitCode") + "')", {
                                success: resolve,
                                error: reject
                            });
                        });
                    });

                    Promise.all(aPromises).then(function () {
                        this.getView().setBusy(false);
                        MessageToast.show(oB.getText("unitDeletedOk"));
                        this._readUnits();
                    }.bind(this)).catch(function (oErr) {
                        this.getView().setBusy(false);
                        this._showErr(oErr, oB.getText("unitDeletedErr"));
                        this._readUnits();
                    }.bind(this));
                }.bind(this)
            });
        },


        /* ================================================================= */
        /*  Helpers & Formatters                                              */
        /* ================================================================= */
        _showErr: function (oErr, sDefault) {
            var sMsg = sDefault;
            try { sMsg = JSON.parse(oErr.responseText).error.message.value || sDefault; }
            catch (e) { /* use default */ }
            MessageBox.error(sMsg);
        },

        formatResType: function (sType) {
            var oM = this.getView().getModel("i18n") || this.getOwnerComponent().getModel("i18n");
            var oB = oM ? oM.getResourceBundle() : null;
            if (!oB) { return sType || ""; }
            switch (sType) {
                case "MATERIAL": return oB.getText("resTypeMaterial");
                case "EQUIPMENT": return oB.getText("resTypeEquipment");
                case "LABOR": return oB.getText("resTypeLabor");
                default: return sType || "";
            }
        },

        formatUnitType: function (sType) {
            var oM = this.getView().getModel("i18n") || this.getOwnerComponent().getModel("i18n");
            var oB = oM ? oM.getResourceBundle() : null;
            if (!oB) { return sType || ""; }
            return sType === "CUS" ? oB.getText("unitTypeCus") : oB.getText("unitTypeSap");
        },

        formatStatusText: function (sStatus) {
            var oM = this.getView().getModel("i18n") || this.getOwnerComponent().getModel("i18n");
            var oB = oM ? oM.getResourceBundle() : null;
            if (!oB) { return sStatus || ""; }
            if (sStatus === "ACTIVE") { return oB.getText("statusActive"); }
            if (sStatus === "INACTIVE") { return oB.getText("statusInactive"); }
            return sStatus;
        },

        formatStatusState: function (sStatus) {
            if (sStatus === "ACTIVE") { return "Success"; }
            if (sStatus === "INACTIVE") { return "Error"; }
            return "None";
        }
    });
});
