sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/core/routing/History",
    "z/bts/buildtrack/controller/delegate/WBSDelegate",
    "sap/ui/model/json/JSONModel",
    "sap/ui/core/format/DateFormat",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "sap/m/Dialog",
    "sap/m/Button",
    "sap/m/Label",
    "sap/m/Input",
    "sap/m/Select",
    "sap/ui/core/Item",
    "sap/m/DatePicker",
    "sap/m/VBox",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/ui/layout/form/SimpleForm"
], function (Controller, History, WBSDelegate, JSONModel, DateFormat,
    MessageToast, MessageBox, Dialog, Button, Label, Input,
    Select, Item, DatePicker, VBox, Filter, FilterOperator, SimpleForm) {
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
            this._sCurrentSiteId = sSiteId;
            var that = this;

            this.getView().bindElement({
                path: "/SiteSet(guid'" + sSiteId + "')",
                events: {
                    dataRequested: function () { that.getView().setBusy(true); },
                    dataReceived: function () { that.getView().setBusy(false); }
                }
            });

            this._loadWbsData();
        },

        _loadWbsData: function () {
            var that = this;
            var oModel = this.getOwnerComponent().getModel();
            oModel.read("/WBSSet", {
                filters: [new Filter("SiteId", FilterOperator.EQ, this._sCurrentSiteId)],
                success: function (oData) {
                    var aTreeData = that._transformToTree(oData.results);
                    var oGanttConfig = that._oWBSDelegate.prepareGanttData(aTreeData);
                    that.getView().getModel("viewData").setProperty("/WBS", aTreeData);
                    that.getView().getModel("viewConfig").setData(oGanttConfig);
                },
                error: function (oError) { console.error("Error reading WBSSet:", oError); }
            });
        },

        onNavBack: function () {
            var oCtx = this.getView().getBindingContext();
            var sProjectId = oCtx ? oCtx.getProperty("ProjectId") : "";
            if (sProjectId) {
                this.getOwnerComponent().getRouter().navTo("Site", { project_id: sProjectId }, true);
            } else {
                this.getOwnerComponent().getRouter().navTo("RouteMain", {}, true);
            }
        },

        // ── WBS: CREATE (root if no row selected, child if row selected) ────────
        onAddWbs: function () {
            var oTable = this.byId("wbsTreeTable");
            var iIndex = oTable ? oTable.getSelectedIndex() : -1;

            if (iIndex >= 0) {
                // A row is selected → create as child of that row
                var oCtx = oTable.getContextByIndex(iIndex);
                var sParentId = oCtx ? oCtx.getProperty("WbsId") : null;
                var sParentName = oCtx ? oCtx.getProperty("WbsName") : "";
                this._openWbsDialog(null, sParentId, sParentName);
            } else {
                // No row selected → create as root WBS (null / GUID zero parent)
                this._openWbsDialog(null, null, null);
            }
        },

        // ── WBS: EDIT ────────────────────────────────────────────────────────
        onEditWbs: function () {
            var oTable = this.byId("wbsTreeTable");
            var iIndex = oTable ? oTable.getSelectedIndex() : -1;
            if (iIndex < 0) {
                MessageToast.show("Please select a WBS row to edit.");
                return;
            }
            var oCtx = oTable.getContextByIndex(iIndex);
            this._openWbsDialog(oCtx, null, null);
        },

        // ── WBS: DELETE ───────────────────────────────────────────────────────
        onDeleteWbs: function () {
            var oTable = this.byId("wbsTreeTable");
            var iIndex = oTable ? oTable.getSelectedIndex() : -1;
            if (iIndex < 0) {
                MessageToast.show("Please select a WBS row to delete.");
                return;
            }
            var oCtx = oTable.getContextByIndex(iIndex);
            var sName = oCtx.getProperty("WbsName");
            var sWbsId = oCtx.getProperty("WbsId");
            var oModel = this.getOwnerComponent().getModel();
            var that = this;

            MessageBox.confirm("Are you sure you want to delete WBS \"" + sName + "\"?\nChild WBS items will not be deleted automatically.", {
                title: "Confirm Delete WBS",
                onClose: function (sAction) {
                    if (sAction === MessageBox.Action.OK) {
                        oModel.remove("/WBSSet('" + sWbsId + "')", {
                            success: function () {
                                MessageToast.show("WBS deleted: " + sName);
                                that._loadWbsData();
                            },
                            error: function () { MessageBox.error("Unable to delete WBS."); }
                        });
                    }
                }
            });
        },

        // ── PRIVATE: Create/Edit WBS Dialog ───────────────────────────────────
        _openWbsDialog: function (oContext, sParentId, sParentName) {
            var that = this;
            var bEdit = !!oContext;
            var oModel = this.getOwnerComponent().getModel();

            var oInputCode = new Input({
                placeholder: "e.g. 1.1.1",
                liveChange: function (oEvent) {
                    var oControl = oEvent.getSource();
                    var sVal = oControl.getValue();
                    if (sVal) {
                        oControl.setValue(sVal.toUpperCase());
                    }
                }
            });
            var oInputName = new Input({ placeholder: "Work item name" });
            var oPickerStart = new DatePicker({ width: "100%", displayFormat: "dd/MM/yyyy", valueFormat: "yyyy-MM-dd" });
            var oPickerEnd = new DatePicker({ width: "100%", displayFormat: "dd/MM/yyyy", valueFormat: "yyyy-MM-dd" });
            var oInputQty = new Input({ type: "Number", placeholder: "0" });
            var oSelectUnit = new Select({
                width: "100%",
                items: [
                    new Item({ key: "M3", text: "Cubic Meter (M3)" }),
                    new Item({ key: "M2", text: "Square Meter (M2)" }),
                    new Item({ key: "M", text: "Linear Meter (M)" }),
                    new Item({ key: "TON", text: "Ton (TON)" }),
                    new Item({ key: "EA", text: "Each (EA)" })
                ]
            });
            var oSelectStatus = new Select({
                width: "100%",
                items: [
                    new Item({ key: "PLANNING", text: "Planning" }),
                    new Item({ key: "PENDING_OPEN", text: "Pending Open" }),
                    new Item({ key: "OPEN_REJECTED", text: "Open Rejected" }),
                    new Item({ key: "OPENED", text: "Opened" }),
                    new Item({ key: "IN_PROGRESS", text: "In Progress" }),
                    new Item({ key: "PENDING_CLOSE", text: "Pending Close" }),
                    new Item({ key: "CLOSE_REJECTED", text: "Close Rejected" }),
                    new Item({ key: "CLOSED", text: "Closed" })
                ],
                visible: false
            });

            var sDialogTitle;
            if (bEdit) {
                sDialogTitle = "Edit WBS";
                oInputCode.setValue(oContext.getProperty("WbsCode"));
                oInputName.setValue(oContext.getProperty("WbsName"));
                var oStart = oContext.getProperty("StartDate");
                var oEnd = oContext.getProperty("EndDate");
                if (oStart) oPickerStart.setDateValue(oStart);
                if (oEnd) oPickerEnd.setDateValue(oEnd);
                var sQty = oContext.getProperty("Quantity");
                if (sQty) oInputQty.setValue(parseFloat(sQty));
                oSelectUnit.setSelectedKey(oContext.getProperty("UnitCode"));
                oSelectStatus.setSelectedKey(oContext.getProperty("Status"));
            } else {
                sDialogTitle = sParentId
                    ? "Add Child WBS of: " + sParentName
                    : "Create WBS (Root Level)";
                oSelectStatus.setSelectedKey("NEW");
            }

            var oStatusLabel = new Label({ text: "Status", visible: false });

            var oForm = new SimpleForm({
                editable: true,
                layout: "ResponsiveGridLayout",
                labelSpanL: 4, labelSpanM: 4, labelSpanS: 12,
                columnsL: 1, columnsM: 1,
                content: [
                    new Label({ text: "WBS Code", required: true }), oInputCode,
                    new Label({ text: "Name", required: true }), oInputName,
                    new Label({ text: "Start Date", required: true }), oPickerStart,
                    new Label({ text: "End Date", required: true }), oPickerEnd,
                    new Label({ text: "Quantity", required: true }), oInputQty,
                    new Label({ text: "Unit" }), oSelectUnit,
                    oStatusLabel, oSelectStatus
                ]
            });

            var oDialog = new Dialog({
                title: sDialogTitle,
                contentWidth: "450px",
                content: [oForm],
                beginButton: new Button({
                    text: bEdit ? "Save Changes" : "Create WBS",
                    type: "Emphasized",
                    press: function () {
                        var sWbsCode = oInputCode.getValue().trim();
                        var sName = oInputName.getValue().trim();
                        var dStart = oPickerStart.getDateValue();
                        var dEnd = oPickerEnd.getDateValue();
                        var sQuantity = oInputQty.getValue() || "0";
                        if (!sWbsCode || !sName || !dStart || !dEnd) {
                            MessageToast.show("Please enter all required fields!");
                            return;
                        }
                        // Fix timezone shift: getDateValue() returns local midnight (UTC+7).
                        // Converting to UTC midnight avoids the date being stored 1 day earlier.
                        var toUTC = function (d) {
                            return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
                        };
                        var oPayload = {
                            WbsCode: sWbsCode,
                            WbsName: sName,
                            StartDate: toUTC(dStart),
                            EndDate: toUTC(dEnd),
                            Quantity: oInputQty.getValue() || "0",
                            UnitCode: oSelectUnit.getSelectedKey(),
                            Status: "PLANNING"  // Default for new WBS; overridden on Edit
                        };
                        if (bEdit) {
                            // Key = WbsId of the row being edited (read from context, not from a form input)
                            var sEditWbsId = oContext.getProperty("WbsId");
                            oPayload.Status = oSelectStatus.getSelectedKey() || oContext.getProperty("Status") || "PLANNING";
                            oModel.update("/WBSSet(guid'" + sEditWbsId + "')", oPayload, {
                                success: function () {
                                    MessageToast.show("WBS updated!");
                                    oDialog.close();
                                    // refresh(true) clears OData V2 client cache so the next
                                    // read() fetches fresh data instead of a stale cached response
                                    oModel.refresh(true);
                                    that._loadWbsData();
                                },
                                error: function () { MessageBox.error("Error updating WBS!"); }
                            });
                        } else {
                            // Backend generates WbsId (GUID) — FE must supply SiteId + optional ParentId
                            oPayload.SiteId = that._sCurrentSiteId;
                            oPayload.ParentId = sParentId || null;
                            oModel.create("/WBSSet", oPayload, {
                                success: function () { MessageToast.show("WBS created successfully!"); oDialog.close(); that._loadWbsData(); },
                                error: function () { MessageBox.error("Error creating WBS!"); }
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
        },

        _transformToTree: function (aData) {
            var map = {}, node, res = [], i;
            for (i = 0; i < aData.length; i++) {
                map[aData[i].WbsId] = i;
                aData[i].children = [];
            }
            for (i = 0; i < aData.length; i++) {
                node = aData[i];
                if (node.ParentId && map[node.ParentId] !== undefined) {
                    aData[map[node.ParentId]].children.push(node);
                } else {
                    res.push(node);
                }
            }
            return res;
        },

        isRootNode: function (v) { return this._oWBSDelegate.isRootNode(v); },
        isChildNode: function (v) { return this._oWBSDelegate.isChildNode(v); },
        calcMargin: function (s) { return this._oWBSDelegate.calcMargin(s); },
        calcWidth: function (s, e) { return this._oWBSDelegate.calcWidth(s, e); },

        formatDate: function (oDate) {
            if (!oDate) return "";
            return DateFormat.getInstance({ pattern: "dd/MM/yyyy" }).format(oDate);
        },

        formatWorkVolume: function (sQuantity, sUnitCode) {
            if (!sQuantity || sQuantity === "0" || sQuantity === "0.000") return "";
            var sFormattedQty = parseFloat(sQuantity).toString(); // remove trailing zeros
            var sUnit = sUnitCode ? " " + sUnitCode : "";
            return sFormattedQty + sUnit;
        },

        onGanttTaskClick: function (oEvent) {
            var oContext = oEvent.getParameter("rowBindingContext");
            if (!oContext) return;
            this.getOwnerComponent().getRouter().navTo("WBSDetail", {
                site_id: oContext.getProperty("SiteId"),
                wbsId: oContext.getProperty("WbsId")
            });
        }
    });
});