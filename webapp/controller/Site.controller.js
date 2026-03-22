sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/core/routing/History",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "sap/m/Dialog",
    "sap/m/Button",
    "sap/m/Label",
    "sap/m/Input",
    "sap/m/Select",
    "sap/ui/core/Item",
    "sap/m/VBox",
    "sap/m/HBox",
    "sap/ui/layout/form/SimpleForm",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/ui/model/json/JSONModel",
    "sap/ui/comp/valuehelpdialog/ValueHelpDialog",
    "sap/ui/comp/filterbar/FilterBar",
    "sap/ui/comp/filterbar/FilterGroupItem",
    "sap/m/Token",
    "sap/m/Column",
    "sap/m/ColumnListItem",
    "sap/m/Text",
    "sap/ui/table/Column"
], function (Controller, History, MessageToast, MessageBox,
    Dialog, Button, Label, Input, Select, Item, VBox, HBox, SimpleForm, Filter, FilterOperator,
    JSONModel, ValueHelpDialog, FilterBar, FilterGroupItem, Token, MColumn, ColumnListItem, Text, UITableColumn) {
    "use strict";

    return Controller.extend("z.bts.buildtrack.controller.Site", {

        onInit: function () {
            this.getView().setModel(new JSONModel({
                siteCodeItems: [],
                siteNameItems: [],
                statusItems: []
            }), "siteVh");

            var oRouter = this.getOwnerComponent().getRouter();
            oRouter.getRoute("Site").attachPatternMatched(this._onObjectMatched, this);
        },

        // ── FORMATTERS ──────────────────────────────────────────────────────
        formatStatusIcon: function (sStatus) {
            var m = {
                "PLANNING": "sap-icon://status-in-process",
                "SUBMITTED": "sap-icon://paper-plane",
                "REJECTED": "sap-icon://status-negative",
                "READY": "sap-icon://status-positive",
                "IN_PROGRESS": "sap-icon://play",
                "COMPLETED": "sap-icon://accept"
            };
            return m[(sStatus || "").toUpperCase()] || "sap-icon://status-inactive";
        },

        formatStatusState: function (sStatus) {
            var m = {
                "PLANNING": "Warning",
                "SUBMITTED": "Information",
                "REJECTED": "Error",
                "READY": "Success",
                "IN_PROGRESS": "Warning",
                "COMPLETED": "Success"
            };
            return m[(sStatus || "").toUpperCase()] || "None";
        },

        formatStatusText: function (sStatus) {
            var mLabels = {
                "PLANNING": "Planning",
                "SUBMITTED": "Submitted",
                "REJECTED": "Rejected",
                "READY": "Ready",
                "IN_PROGRESS": "In Progress",
                "COMPLETED": "Completed"
            };
            return mLabels[(sStatus || "").toUpperCase()] || sStatus;
        },

        _onObjectMatched: function (oEvent) {
            var sProjectId = oEvent.getParameter("arguments").project_id;
            this._sCurrentProjectId = sProjectId;
            this._sSiteVhProjectId = null;

            var oVhModel = this.getView().getModel("siteVh");
            if (oVhModel) {
                oVhModel.setProperty("/siteCodeItems", []);
                oVhModel.setProperty("/siteNameItems", []);
                oVhModel.setProperty("/statusItems", []);
            }

            var oView = this.getView();
            oView.bindElement({
                path: "/ProjectSet(guid'" + sProjectId + "')",
                parameters: { expand: "ToSites" },
                events: {
                    dataRequested: function () { oView.setBusy(true); },
                    dataReceived: function () {
                        oView.setBusy(false);
                        this._loadSiteValueHelps();
                    }.bind(this)
                }
            });
        },

        _loadSiteValueHelps: function (fnDone) {
            var oModel = this.getOwnerComponent().getModel();
            var oVhModel = this.getView().getModel("siteVh");
            if (!oModel || !oVhModel || !this._sCurrentProjectId) {
                if (fnDone) {
                    fnDone();
                }
                return;
            }

            var fnSetValueHelpItems = function (aRows) {
                var mCodes = Object.create(null);
                var mNames = Object.create(null);
                var mStatuses = Object.create(null);

                (aRows || []).forEach(function (oRow) {
                    var sCode = (oRow.SiteCode || "").trim();
                    var sName = (oRow.SiteName || "").trim();
                    var sStatus = (oRow.Status || "").trim();
                    if (sCode) { mCodes[sCode] = sName; }
                    if (sName) { mNames[sName] = sCode; }
                    if (sStatus) { mStatuses[sStatus] = true; }
                });

                oVhModel.setProperty("/siteCodeItems", Object.keys(mCodes).sort().map(function (sKey) {
                    return { key: sKey, text: sKey, additionalText: mCodes[sKey] || "" };
                }));
                oVhModel.setProperty("/siteNameItems", Object.keys(mNames).sort().map(function (sKey) {
                    return { key: sKey, text: sKey, additionalText: mNames[sKey] || "" };
                }));
                oVhModel.setProperty("/statusItems", Object.keys(mStatuses).sort().map(function (sKey) {
                    return { key: sKey, text: sKey };
                }));
            };

            oModel.read("/SiteSet", {
                filters: [new Filter("ProjectId", FilterOperator.EQ, this._sCurrentProjectId)],
                success: function (oData) {
                    var sCurrentPid = (this._sCurrentProjectId || "").toLowerCase();
                    var aResults = (oData && oData.results) ? oData.results : [];
                    var aScoped = aResults.filter(function (oRow) {
                        return ((oRow.ProjectId || "") + "").toLowerCase() === sCurrentPid;
                    });
                    fnSetValueHelpItems(aScoped);
                    this._sSiteVhProjectId = this._sCurrentProjectId;
                    if (fnDone) {
                        fnDone();
                    }
                }.bind(this),
                error: function () {
                    oVhModel.setProperty("/siteCodeItems", []);
                    oVhModel.setProperty("/siteNameItems", []);
                    oVhModel.setProperty("/statusItems", []);
                    if (fnDone) {
                        fnDone();
                    }
                }
            });
        },

        _openSiteValueHelpWithFreshData: function (mOptions) {
            if (!this._sCurrentProjectId) {
                return;
            }

            if (this._sSiteVhProjectId === this._sCurrentProjectId) {
                this._openSimpleSiteValueHelpDialog(mOptions);
                return;
            }

            this._loadSiteValueHelps(function () {
                this._openSimpleSiteValueHelpDialog(mOptions);
            }.bind(this));
        },

        _openSimpleSiteValueHelpDialog: function (mOptions) {
            var oInput = this.byId(mOptions.inputId);
            var oVhModel = this.getView().getModel("siteVh");
            var aAllItems = (oVhModel && oVhModel.getProperty(mOptions.itemsPath)) || [];
            var oTableModel = new JSONModel(aAllItems);

            var fnWildcardMatch = function (sValue, sPattern) {
                if (!sPattern) { return true; }
                var sEscaped = sPattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
                return new RegExp("^" + sEscaped + "$", "i").test(sValue || "");
            };

            var fnApplyPatternFilter = function (sPatternRaw) {
                var sPattern = (sPatternRaw || "").trim();
                if (!sPattern) {
                    oTableModel.setData(aAllItems);
                    return;
                }
                var bHasWildcard = sPattern.indexOf("*") !== -1;
                var sNeedle = sPattern.toLowerCase();
                var aFiltered = aAllItems.filter(function (oItem) {
                    var sKey = (oItem.key || "").toString();
                    var sText = (oItem.text || "").toString();
                    if (bHasWildcard) {
                        return fnWildcardMatch(sKey, sPattern) || fnWildcardMatch(sText, sPattern);
                    }
                    return sKey.toLowerCase().indexOf(sNeedle) !== -1 || sText.toLowerCase().indexOf(sNeedle) !== -1;
                });
                oTableModel.setData(aFiltered);
            };

            var oDialog = new ValueHelpDialog({
                title: mOptions.title,
                key: "key",
                descriptionKey: "text",
                supportMultiselect: false,
                supportRanges: true,
                ok: function (oEvent) {
                    var aTokens = oEvent.getParameter("tokens") || [];
                    oInput.setValue(aTokens.length ? aTokens[0].getKey() : "");
                    oDialog.close();
                },
                cancel: function () { oDialog.close(); },
                afterClose: function () { oDialog.destroy(); }
            });

            oDialog.setRangeKeyFields([{ label: mOptions.title, key: "key", type: "string" }]);
            var sCurrent = (oInput.getValue() || "").trim();
            if (sCurrent) {
                oDialog.setTokens([new Token({ key: sCurrent, text: sCurrent })]);
            }

            var oPatternInput = new Input({ placeholder: mOptions.patternPlaceholder || "*text*" });
            var oInnerFilterBar = new FilterBar({
                useToolbar: true,
                showGoOnFB: true,
                search: function () {
                    fnApplyPatternFilter(oPatternInput.getValue());
                    oDialog.update();
                }
            });
            oInnerFilterBar.addFilterGroupItem(new FilterGroupItem({
                groupName: "Basic",
                name: "Pattern",
                label: "Pattern",
                visibleInFilterBar: true,
                control: oPatternInput
            }));
            oDialog.setFilterBar(oInnerFilterBar);

            oDialog.getTableAsync().then(function (oTable) {
                oTable.setModel(oTableModel);
                if (oTable.bindRows) {
                    oTable.addColumn(new UITableColumn({ label: new Label({ text: mOptions.primaryLabel }), template: new Text({ text: "{key}" }) }));
                    if (mOptions.showSecondary) {
                        oTable.addColumn(new UITableColumn({ label: new Label({ text: mOptions.secondaryLabel }), template: new Text({ text: "{additionalText}" }) }));
                    }
                    oTable.bindRows("/");
                } else {
                    oTable.addColumn(new MColumn({ header: new Label({ text: mOptions.primaryLabel }) }));
                    if (mOptions.showSecondary) {
                        oTable.addColumn(new MColumn({ header: new Label({ text: mOptions.secondaryLabel }) }));
                    }
                    var aCells = [new Text({ text: "{key}" })];
                    if (mOptions.showSecondary) {
                        aCells.push(new Text({ text: "{additionalText}" }));
                    }
                    oTable.bindItems("/", new ColumnListItem({ cells: aCells }));
                }
                oDialog.update();
            });

            oDialog.open();
        },

        onValueHelpSiteCodeRequest: function () {
            this._openSiteValueHelpWithFreshData({
                inputId: "fbSiteCode",
                title: "Site Code",
                itemsPath: "/siteCodeItems",
                primaryLabel: "Site Code",
                showSecondary: true,
                secondaryLabel: "Site Name",
                patternPlaceholder: "SITE* hoặc *SITE*"
            });
        },

        onValueHelpSiteNameRequest: function () {
            this._openSiteValueHelpWithFreshData({
                inputId: "fbSiteName",
                title: "Site Name",
                itemsPath: "/siteNameItems",
                primaryLabel: "Site Name",
                showSecondary: true,
                secondaryLabel: "Site Code",
                patternPlaceholder: "*Name*"
            });
        },

        onValueHelpSiteStatusRequest: function () {
            this._openSiteValueHelpWithFreshData({
                inputId: "fbSiteStatus",
                title: "Status",
                itemsPath: "/statusItems",
                primaryLabel: "Status",
                showSecondary: false,
                secondaryLabel: "",
                patternPlaceholder: "*PLAN*"
            });
        },

        onFilterSearch: function () {
            var sSiteCode = (this.byId("fbSiteCode").getValue() || "").trim();
            var sSiteName = (this.byId("fbSiteName").getValue() || "").trim();
            var sStatus = (this.byId("fbSiteStatus").getValue() || "").trim();

            var aFilters = [];
            if (sSiteCode) {
                aFilters.push(new Filter("SiteCode", FilterOperator.EQ, sSiteCode));
            }
            if (sSiteName) {
                aFilters.push(new Filter("SiteName", FilterOperator.EQ, sSiteName));
            }
            if (sStatus) {
                aFilters.push(new Filter("Status", FilterOperator.EQ, sStatus));
            }

            var oBinding = this.byId("siteTable").getBinding("items");
            if (oBinding) {
                oBinding.filter(aFilters);
            }
        },

        onFilterClear: function () {
            this.byId("fbSiteCode").setValue("");
            this.byId("fbSiteName").setValue("");
            this.byId("fbSiteStatus").setValue("");
            this.onFilterSearch();
        },

        // ── SEARCH ──────────────────────────────────────────────────────────
        onSearch: function (oEvent) {
            var sQuery = oEvent.getParameter("query") || oEvent.getParameter("newValue") || "";
            clearTimeout(this._searchTimer);
            this._searchTimer = setTimeout(function () {
                var aFilters = [];
                // Since expand="ToSites" is used, the items binding natively has a filter option if we pass it to the table, 
                // but wait, $expand does not support $filter directly on the expanded collection in V2 unless done via an association.
                // However, UI5 local filtering works on the expanded array.
                if (sQuery && sQuery.length > 0) {
                    var sUpperQuery = sQuery.toUpperCase();
                    if (sUpperQuery.indexOf("-") !== -1 || sUpperQuery.indexOf("PRJ") !== -1 || sUpperQuery.indexOf("SITE") !== -1) {
                        aFilters.push(new Filter("SiteCode", FilterOperator.EQ, sQuery));
                    } else {
                        aFilters.push(new Filter("SiteName", FilterOperator.EQ, sQuery));
                    }
                }
                var oTable = this.byId("siteTable");
                var oBinding = oTable.getBinding("items");
                if (oBinding) {
                    oBinding.filter(aFilters);
                }
            }.bind(this), 500);
        },

        onSitePress: function (oEvent) {
            var oCtx = oEvent.getSource().getBindingContext();
            if (!oCtx) return;
            this.getOwnerComponent().getRouter().navTo("SiteDetail", {
                site_id: oCtx.getProperty("SiteId")
            });
        },

        onNavBack: function () {
            this.getOwnerComponent().getRouter().navTo("RouteMain", {}, true);
        },

        onAddSite: function () {
            this._openSiteDialog(null);
        },

        onEditSite: function (oEvent) {
            oEvent.cancelBubble && oEvent.cancelBubble();
            var oContext = oEvent.getSource().getBindingContext();
            this._openSiteDialog(oContext);
        },

        onDeleteSite: function (oEvent) {
            oEvent.cancelBubble && oEvent.cancelBubble();
            var oContext = oEvent.getSource().getBindingContext();
            var sName = oContext.getProperty("SiteName");
            var sPath = oContext.getPath();
            var oModel = this.getOwnerComponent().getModel();

            MessageBox.confirm("Are you sure you want to delete site \"" + sName + "\"?", {
                title: "Confirm Delete",
                onClose: function (sAction) {
                    if (sAction === MessageBox.Action.OK) {
                        oModel.remove(sPath, {
                            success: function () { MessageToast.show("Site deleted successfully!"); },
                            error: function () { MessageBox.error("Unable to delete site."); }
                        });
                    }
                }
            });
        },

        _openSiteDialog: function (oContext) {
            var that = this;
            var bEdit = !!oContext;
            var oModel = this.getOwnerComponent().getModel();

            var oInputCode = new Input({
                placeholder: "e.g. SITE-001",
                liveChange: function (oEvent) {
                    var oSource = oEvent.getSource();
                    oSource.setValue(oSource.getValue().toUpperCase());
                }
            });
            var oInputName = new Input({ placeholder: "Site name" });
            var oInputAddress = new Input({ placeholder: "Address" });
            if (bEdit) {
                oInputCode.setValue(oContext.getProperty("SiteCode"));
                oInputName.setValue(oContext.getProperty("SiteName"));
                oInputAddress.setValue(oContext.getProperty("Address"));
            }

            var oForm = new SimpleForm({
                editable: true,
                layout: "ResponsiveGridLayout",
                labelSpanL: 4, labelSpanM: 4, labelSpanS: 12,
                columnsL: 1, columnsM: 1,
                content: [
                    new Label({ text: "Site Code", required: true }), oInputCode,
                    new Label({ text: "Site Name", required: true }), oInputName,
                    new Label({ text: "Address" }), oInputAddress
                ]
            });

            var oDialog = new Dialog({
                title: bEdit ? "Edit Site" : "Add New Site",
                contentWidth: "450px",
                content: [oForm],
                beginButton: new Button({
                    text: bEdit ? "Save Changes" : "Create",
                    type: "Emphasized",
                    press: function () {
                        var sCode = oInputCode.getValue().trim();
                        var sName = oInputName.getValue().trim();
                        if (!sCode || !sName) {
                            MessageToast.show("Please enter Site Code and Name!");
                            return;
                        }
                        var oPayload = {
                            SiteCode: sCode,
                            SiteName: sName,
                            Address: oInputAddress.getValue().trim(),
                            Status: bEdit ? oContext.getProperty("Status") : "PLANNING"
                        };
                        if (!bEdit) {
                            oPayload.ProjectId = that._sCurrentProjectId;
                        }
                        if (bEdit) {
                            oModel.update(oContext.getPath(), oPayload, {
                                success: function () { MessageToast.show("Site updated!"); oDialog.close(); },
                                error: function () { MessageBox.error("Error updating site!"); }
                            });
                        } else {
                            oModel.create("/SiteSet", oPayload, {
                                success: function () { MessageToast.show("Site created successfully!"); oDialog.close(); },
                                error: function () { MessageBox.error("Error creating site!"); }
                            });
                        }
                    }
                }),
                endButton: new Button({
                    text: "Cancel",
                    press: function () { oDialog.close(); }
                }),
                afterClose: function () { oDialog.destroy(); }
            });

            oDialog.addStyleClass("sapUiContentPadding");
            oDialog.open();
        }
    });
});