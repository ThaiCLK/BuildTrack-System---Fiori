sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "z/bts/buildtrack551/controller/delegate/WBSDelegate",
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
    "sap/m/TextArea",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/ui/layout/form/SimpleForm",
    "sap/ui/comp/valuehelpdialog/ValueHelpDialog",
    "sap/ui/comp/filterbar/FilterBar",
    "sap/ui/comp/filterbar/FilterGroupItem",
    "sap/m/Token",
    "sap/m/Column",
    "sap/m/ColumnListItem",
    "sap/m/Text",
    "sap/ui/table/Column",
    "sap/m/HBox",
    "z/bts/buildtrack551/controller/delegate/WorkSummaryDelegate",
    "sap/ui/core/Fragment",
    "z/bts/buildtrack551/controller/delegate/ApprovalLogDelegate"
], function (Controller, WBSDelegate, JSONModel, DateFormat,
    MessageToast, MessageBox, Dialog, Button, Label, Input,
    Select, Item, DatePicker, TextArea, Filter, FilterOperator, SimpleForm,
    ValueHelpDialog, FilterBar, FilterGroupItem, Token, MColumn, MColumnListItem, MText, UITableColumn, HBox,
    WorkSummaryDelegate, Fragment, ApprovalLogDelegate) {
    "use strict";

    var SiteDetailController = Controller.extend("z.bts.buildtrack551.controller.SiteDetail", {

        _getResourceBundle: function () {
            var oView = this.getView();
            var oModel = oView ? oView.getModel("i18n") : null;
            if (!oModel) {
                oModel = this.getOwnerComponent().getModel("i18n");
            }
            return oModel ? oModel.getResourceBundle() : null;
        },

        formatSiteDetailTitle: function (sSiteName) {
            var oBundle = this._getResourceBundle();
            return oBundle ? oBundle.getText("siteDetailTitle", [sSiteName || ""]) : sSiteName;
        },

        formatStatusText: function (sStatus) {
            var oBundle = this._getResourceBundle();
            if (!oBundle) { return sStatus; }
            var m = {
                "PLANNING": oBundle.getText("planningStatus"),
                "IN_PROGRESS": oBundle.getText("inProgressStatus"),
                "CLOSED": oBundle.getText("closedStatus")
            };
            return m[(sStatus || "").toUpperCase()] || sStatus;
        },

        formatWbsStatusText: function (sStatus) {
            var oBundle = this._getResourceBundle();
            if (!oBundle) { return sStatus; }
            var m = {
                "PLANNING": oBundle.getText("planningStatus"),
                "SUBMITTED": oBundle.getText("submittedStatus"),
                "REJECTED": oBundle.getText("rejectedStatus"),
                "READY": oBundle.getText("readyStatus"),
                "IN_PROGRESS": oBundle.getText("inProgressStatus"),
                "COMPLETED": oBundle.getText("completedStatus"),
                "PENDING_OPEN": oBundle.getText("pendingOpenStatus") || "Pending Open",
                "OPEN_REJECTED": oBundle.getText("openRejectedStatus") || "Open Rejected",
                "PENDING_CLOSE": oBundle.getText("pendingCloseStatus") || "Pending Close",
                "CLOSE_REJECTED": oBundle.getText("closeRejectedStatus") || "Close Rejected",
                "OPENED": oBundle.getText("openedStatus") || "Opened",
                "CLOSED": oBundle.getText("closedStatus") || "Closed"
            };
            return m[(sStatus || "").toUpperCase()] || sStatus;
        },


        onInit: function () {
            this._oWBSDelegate = new WBSDelegate(this);
            var oRouter = this.getOwnerComponent().getRouter();
            oRouter.getRoute("SiteDetail").attachPatternMatched(this._onObjectMatched, this);
            this.getView().setModel(new JSONModel({
                WBS: [],
                pendingWBS: [],
                pendingOpenWBS: [],
                pendingCloseWBS: [],
                editMode: false
            }), "viewData");
            this.getView().setModel(new JSONModel(), "viewConfig");
            // Init Delegates & Models for Acceptance Report
            WorkSummaryDelegate.init(this);
            ApprovalLogDelegate.init(this);
            this.getView().setModel(new JSONModel({}), "locationModel");
            this.getView().setModel(new JSONModel({}), "workSummaryModel");
            this.getView().setModel(new JSONModel({}), "projectModel");
            this.getView().setModel(new JSONModel({}), "editModel");
            sap.ui.getCore().getEventBus().subscribe("Global", "RefreshData", this._onGlobalRefresh, this);
        },

        onExit: function () {
            sap.ui.getCore().getEventBus().unsubscribe("Global", "RefreshData", this._onGlobalRefresh, this);
        },

        _getUnitValueHelpApiModel: function () {
            if (!this._oUnitValueHelpApiModel) {
                this._oUnitValueHelpApiModel = new sap.ui.model.odata.v2.ODataModel(
                    "/sap/opu/odata/sap/ZC_BT_UNIT_CDS/",
                    {
                        useBatch: false,
                        defaultCountMode: "None"
                    }
                );
            }

            return this._oUnitValueHelpApiModel;
        },

        _normalizeUnitValueHelpEntry: function (oRaw, oProfile) {
            if (!oRaw) {
                return null;
            }

            var fnPick = function (aCandidates) {
                for (var i = 0; i < aCandidates.length; i++) {
                    var v = aCandidates[i];
                    if (v !== undefined && v !== null && String(v).trim() !== "") {
                        return String(v).trim();
                    }
                }

                return "";
            };

            var sUnitCode = fnPick([
                oRaw[oProfile.code],
                oRaw.UnitCode,
                oRaw.unit_code,
                oRaw.UNIT_CODE,
                oRaw.unitCode
            ]);

            if (!sUnitCode) {
                return null;
            }

            return {
                UnitCode: sUnitCode,
                UnitName: fnPick([
                    oRaw[oProfile.name],
                    oRaw.UnitName,
                    oRaw.unit_name,
                    oRaw.UNIT_NAME,
                    oRaw.unitName
                ]),
                Status: fnPick([
                    oRaw[oProfile.status],
                    oRaw.Status,
                    oRaw.status,
                    oRaw.STATUS
                ])
            };
        },

        _readUnitValueHelpPage: function (mQuery, fnSuccess, fnError) {
            var that = this;
            var oUnitModel = this._getUnitValueHelpApiModel();
            var aProfiles = [
                { code: "unit_code", name: "unit_name", status: "status" },
                { code: "UnitCode", name: "UnitName", status: "Status" },
                { code: "UNIT_CODE", name: "UNIT_NAME", status: "STATUS" }
            ];

            var iStartProfile = (typeof this._iUnitFieldProfileIndex === "number") ? this._iUnitFieldProfileIndex : 0;
            var iPageSize = mQuery.pageSize || 30;
            var iTargetSkip = mQuery.skip || 0;
            var sCodeNeedle = (mQuery.code || "").trim().toLowerCase();
            var sNameNeedle = (mQuery.name || "").trim().toLowerCase();

            var fnBuildFilters = function (oProfile) {
                var aFilters = [];

                // Always keep value help constrained to active units only.
                aFilters.push(new Filter(oProfile.status, FilterOperator.EQ, "ACTIVE"));

                return aFilters;
            };

            var fnMatchesContainsIgnoreCase = function (oItem) {
                if (!oItem || String(oItem.Status || "").toUpperCase() !== "ACTIVE") {
                    return false;
                }

                var sCode = (oItem.UnitCode || "").toLowerCase();
                var sName = (oItem.UnitName || "").toLowerCase();

                if (sCodeNeedle && sCode.indexOf(sCodeNeedle) === -1) {
                    return false;
                }
                if (sNameNeedle && sName.indexOf(sNameNeedle) === -1) {
                    return false;
                }

                return true;
            };

            var fnTryReadByProfile = function (iProfile) {
                if (iProfile >= aProfiles.length) {
                    if (fnError) {
                        fnError();
                    }
                    return;
                }

                var oProfile = aProfiles[iProfile];
                var iServerSkip = 0;
                var iChunkSize = 200;
                var iRemainSkip = iTargetSkip;
                var aPageRows = [];

                var fnReadChunk = function () {
                    oUnitModel.read("/ZC_BT_UNIT", {
                        filters: fnBuildFilters(oProfile),
                        urlParameters: {
                            "$top": String(iChunkSize),
                            "$skip": String(iServerSkip)
                        },
                        success: function (oData) {
                            that._iUnitFieldProfileIndex = iProfile;

                            var aRaw = oData.results || [];
                            if (aRaw.length === 0) {
                                fnSuccess(aPageRows, false);
                                return;
                            }

                            for (var i = 0; i < aRaw.length; i++) {
                                var oNormalized = that._normalizeUnitValueHelpEntry(aRaw[i], oProfile);
                                if (!fnMatchesContainsIgnoreCase(oNormalized)) {
                                    continue;
                                }

                                if (iRemainSkip > 0) {
                                    iRemainSkip -= 1;
                                    continue;
                                }

                                aPageRows.push(oNormalized);
                                if (aPageRows.length > iPageSize) {
                                    fnSuccess(aPageRows.slice(0, iPageSize), true);
                                    return;
                                }
                            }

                            iServerSkip += aRaw.length;
                            if (aRaw.length < iChunkSize) {
                                fnSuccess(aPageRows, false);
                                return;
                            }

                            fnReadChunk();
                        },
                        error: function () {
                            fnTryReadByProfile(iProfile + 1);
                        }
                    });
                };

                fnReadChunk();
            };

            fnTryReadByProfile(iStartProfile);
        },

        _openUnitValueHelpDialog: function (oTargetInput) {
            var that = this;
            var oBundle = this.getView().getModel("i18n").getResourceBundle();

            var oCodeInput = new Input({ placeholder: oBundle.getText("enterKeyword") });
            var oNameInput = new Input({ placeholder: oBundle.getText("enterKeyword") });
            var oPrevButton = new Button({ text: oBundle.getText("unitVhPrev") });
            var oNextButton = new Button({ text: oBundle.getText("unitVhNext") });
            var oPageInfoText = new MText({});
            var oPagerBox = new HBox({
                alignItems: "Center",
                items: [oPrevButton, oPageInfoText, oNextButton]
            });

            var oTableModel = new JSONModel([]);
            var mState = {
                page: 1,
                pageSize: 30,
                hasMore: false
            };

            var oDialog = new ValueHelpDialog({
                title: oBundle.getText("unitVhTitle"),
                key: "UnitCode",
                descriptionKey: "UnitName",
                supportMultiselect: false,
                supportRanges: false,
                ok: function (oEvent) {
                    var aTokens = oEvent.getParameter("tokens") || [];
                    var sPicked = aTokens.length > 0 ? (aTokens[0].getKey() || "") : "";

                    oTargetInput.setValue(sPicked || "");
                    oTargetInput.setValueState("None");
                    oTargetInput.setValueStateText("");

                    oDialog.close();
                },
                cancel: function () {
                    oDialog.close();
                },
                afterClose: function () {
                    oDialog.destroy();
                }
            });

            var fnUpdatePager = function () {
                oPrevButton.setEnabled(mState.page > 1);
                oNextButton.setEnabled(!!mState.hasMore);
                oPageInfoText.setText(oBundle.getText("unitVhPageInfo", [mState.page]));
            };

            var fnLoadPage = function () {
                oDialog.setBusy(true);

                that._readUnitValueHelpPage({
                    code: (oCodeInput.getValue() || "").trim(),
                    name: (oNameInput.getValue() || "").trim(),
                    pageSize: mState.pageSize,
                    skip: (mState.page - 1) * mState.pageSize
                }, function (aRows, bHasMore) {
                    mState.hasMore = bHasMore;
                    oTableModel.setData(aRows || []);
                    fnUpdatePager();
                    oDialog.update();
                    oDialog.setBusy(false);
                }, function () {
                    oTableModel.setData([]);
                    mState.hasMore = false;
                    fnUpdatePager();
                    oDialog.update();
                    oDialog.setBusy(false);
                    MessageBox.error(oBundle.getText("unitVhLoadError"));
                });
            };

            oPrevButton.attachPress(function () {
                if (mState.page <= 1) {
                    return;
                }

                mState.page -= 1;
                fnLoadPage();
            });

            oNextButton.attachPress(function () {
                if (!mState.hasMore) {
                    return;
                }

                mState.page += 1;
                fnLoadPage();
            });

            var oFilterBar = new FilterBar({
                useToolbar: true,
                showGoOnFB: true,
                search: function () {
                    mState.page = 1;
                    fnLoadPage();
                }
            });

            oFilterBar.addFilterGroupItem(new FilterGroupItem({
                groupName: "Basic",
                name: "UnitCode",
                label: oBundle.getText("unitColCode"),
                visibleInFilterBar: true,
                control: oCodeInput
            }));
            oFilterBar.addFilterGroupItem(new FilterGroupItem({
                groupName: "Basic",
                name: "UnitName",
                label: oBundle.getText("unitColName"),
                visibleInFilterBar: true,
                control: oNameInput
            }));
            oFilterBar.addFilterGroupItem(new FilterGroupItem({
                groupName: "Basic",
                name: "Paging",
                label: "",
                visibleInFilterBar: true,
                control: oPagerBox
            }));

            oDialog.setFilterBar(oFilterBar);

            var sCurrentValue = (oTargetInput.getValue() || "").trim();
            if (sCurrentValue) {
                oDialog.setTokens([new Token({ key: sCurrentValue, text: sCurrentValue })]);
            }

            oDialog.getTableAsync().then(function (oTable) {
                oTable.setModel(oTableModel);

                if (oTable.bindRows) {
                    oTable.addColumn(new UITableColumn({ label: new Label({ text: oBundle.getText("unitColCode") }), template: new MText({ text: "{UnitCode}" }) }));
                    oTable.addColumn(new UITableColumn({ label: new Label({ text: oBundle.getText("unitColName") }), template: new MText({ text: "{UnitName}" }) }));
                    oTable.bindRows("/");
                } else {
                    oTable.addColumn(new MColumn({ header: new Label({ text: oBundle.getText("unitColCode") }) }));
                    oTable.addColumn(new MColumn({ header: new Label({ text: oBundle.getText("unitColName") }) }));
                    oTable.bindItems("/", new MColumnListItem({
                        cells: [
                            new MText({ text: "{UnitCode}" }),
                            new MText({ text: "{UnitName}" })
                        ]
                    }));
                }

                fnLoadPage();
                oDialog.open();
            }).catch(function () {
                MessageBox.error(oBundle.getText("unitVhLoadError"));
            });
        },

        onTabSelect: function (oEvent) {
            var sKey = oEvent.getParameter("key");
            this.onCancelSite(); // Resets editMode and any pending OData model changes

            // Clear selections when switching tabs
            var oWbsTable = this.byId("wbsTreeTable");
            if (oWbsTable) { oWbsTable.clearSelection(); }
            var oPendingTable = this.byId("pendingApprovalTable");
            if (oPendingTable) { oPendingTable.removeSelections(true); }
        },

        onNavToDashboard: function () {
            this.getOwnerComponent().getRouter().navTo("Dashboard");
        },

        /* =========================================================== */
        /* INLINE EDIT MODE - SITE GENERAL INFO                        */
        /* =========================================================== */
        onEditSite: function () {
            var oBundle = this.getView().getModel("i18n").getResourceBundle();
            // Permission check: ZBT_SITE — AuthLevel 1 (Lead Engineer) or 99 (System Admin)
            if (!this._checkWbsSitePermission()) {
                sap.m.MessageBox.error(oBundle.getText("createSitePermissionError"));
                return;
            }
            var oCtx = this.getView().getBindingContext();
            var oData = oCtx ? oCtx.getObject() : {};
            // Create a deep copy for editing to isolate from header
            this.getView().getModel("editModel").setData(JSON.parse(JSON.stringify(oData)));
            this.getView().getModel("viewData").setProperty("/editMode", true);
        },

        onCancelSite: function () {
            this.getView().getModel("viewData").setProperty("/editMode", false);
        },

        // Permission helper: ZBT_WBS and ZBT_SITE require AuthLevel 1 (Lead Engineer) or 99 (System Admin)
        _checkWbsSitePermission: function () {
            var oUserModel = this.getView().getModel("userModel");
            if (!oUserModel) return false;
            var iAuthLevel = parseInt(oUserModel.getProperty("/authLevel"), 10);
            return iAuthLevel === 1 || iAuthLevel === 99;
        },

        onSaveSite: function () {
            var oModel = this.getOwnerComponent().getModel();
            var oEditModel = this.getView().getModel("editModel");
            var oData = oEditModel.getData();
            var oBundle = this.getView().getModel("i18n").getResourceBundle();
            var that = this;

            // 1. Validation
            if (!oData.SiteName || !oData.Address || oData.SiteName.trim() === "" || oData.Address.trim() === "") {
                MessageBox.error(oBundle.getText("siteNameAddressRequired"));
                return;
            }

            var sPath = "/SiteSet(guid'" + this._sCurrentSiteId + "')";
            var bIsEditMode = this.getView().getModel("viewData").getProperty("/editMode");

            if (!bIsEditMode) {
                return;
            }

            // 2. Payload from editModel (isolates from UI control specifics and fixes TypeError)
            var oPayload = {
                SiteCode: oData.SiteCode,
                Address: oData.Address,
                Status: oData.Status,
                SiteName: oData.SiteName,
                Client: oData.Client,
                ProjectId: oData.ProjectId
            };

            this.getView().setBusy(true);
            oModel.update(sPath, oPayload, {
                success: function () {
                    that.getView().setBusy(false);
                    MessageToast.show(oBundle.getText("siteUpdateSuccess"));
                    that.getView().getModel("viewData").setProperty("/editMode", false);
                    // Chỉ invalidate element binding của view hiện tại, tránh rebuild toàn bộ model
                    var oBinding = that.getView().getElementBinding();
                    if (oBinding) { oBinding.refresh(); }
                },
                error: function (oError) {
                    that.getView().setBusy(false);
                    that._showError(oError, "siteUpdateError");
                }
            });
        },

        onNavBack: function () {
            this.onCancelSite();
            // Check if there is a previous history entry
            var oHistory = sap.ui.core.routing.History.getInstance();
            var sPreviousHash = oHistory.getPreviousHash();

            if (sPreviousHash !== undefined) {
                window.history.go(-1);
            } else {
                this.getOwnerComponent().getRouter().navTo("RouteMain", {}, true);
            }
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

            this.onCancelSite();

            // Clear selections on navigation
            var oWbsTable = this.byId("wbsTreeTable");
            if (oWbsTable) { oWbsTable.clearSelection(); }
            var oPendingTable = this.byId("pendingApprovalTable");
            if (oPendingTable) { oPendingTable.removeSelections(true); }

            this._loadWbsData();
        },

        _onGlobalRefresh: function () {
            if (!this._sCurrentSiteId) return;
            // Làm tươi lại Header Bindings
            var oBinding = this.getView().getElementBinding();
            if (oBinding) { oBinding.refresh(true); }
            // Nạp lại danh sách WBS và Log Duyệt
            this._loadWbsData();
        },

        _loadWbsData: function () {
            var that = this;
            var oModel = this.getOwnerComponent().getModel();
            var oView = this.getView();
            
            oView.setBusy(true);

            oModel.read("/SiteSet(guid'" + this._sCurrentSiteId + "')/ToWbs", {
                urlParameters: {
                    "$expand": "ToSubWbs,ToSubWbs/ToSubWbs,ToApprovalLog,ToSubWbs/ToApprovalLog,ToSubWbs/ToSubWbs/ToApprovalLog",
                    "$orderby": "StartDate"
                },
                headers: {
                    "Cache-Control": "no-cache, no-store, must-revalidate",
                    "Pragma": "no-cache",
                    "Expires": "0"
                },
                success: function (oData) {
                    var aRawResults = oData.results || [];
                    var aResults = [];
                    var mSeen = {};
                    
                    var fnFlatten = function (aItems) {
                        if (!aItems) return;
                        aItems.forEach(function (oItem) {
                            if (!mSeen[oItem.WbsId]) {
                                aResults.push(oItem);
                                mSeen[oItem.WbsId] = true;
                            }
                            if (oItem.ToSubWbs && oItem.ToSubWbs.results) {
                                fnFlatten(oItem.ToSubWbs.results);
                            }
                        });
                    };
                    fnFlatten(aRawResults);

                    // Sort results
                    aResults.sort(function (a, b) {
                        var parseDate = function (val) {
                            if (!val) return 0;
                            if (typeof val === "string" && val.indexOf("/Date(") === 0) {
                                return parseInt(val.replace(/[^0-9]/g, ""), 10);
                            }
                            return new Date(val).getTime() || 0;
                        };
                        var tA = parseDate(a.StartDate);
                        var tB = parseDate(b.StartDate);
                        if (tA !== tB) return tA - tB;
                        return (a.WbsName || "").localeCompare(b.WbsName || "");
                    });

                    // 1. FAST RENDERING: Render Base WBS Tree initially without DailyLogs to unblock UI immediately
                    that._finalizeWbsLoad(aResults);

                    // 2. Fetch all Daily Logs for these WBS items in the background
                    var aWbsIds = aResults.map(function (w) { return w.WbsId; });
                    if (aWbsIds.length === 0) {
                        return; // Nothing to fetch
                    }

                    // Tối ưu Fiori: Nhóm thành mảng Filter OR
                    var aFilters = aWbsIds.map(function (sId) {
                        return new Filter("WbsId", FilterOperator.EQ, sId);
                    });

                    oModel.read("/DailyLogSet", {
                        filters: [new Filter({ filters: aFilters, and: false })],
                        success: function (oLogData) {
                            var aLogs = oLogData.results || [];
                            var mLogStats = {};
                            aLogs.forEach(function (oLog) {
                                var sId = oLog.WbsId;
                                if (!mLogStats[sId]) mLogStats[sId] = { min: null, max: null };
                                var dLog = (oLog.LogDate instanceof Date) ? oLog.LogDate : new Date(oLog.LogDate);
                                if (!isNaN(dLog.getTime()) && dLog.getFullYear() > 1970) {
                                    if (!mLogStats[sId].min || dLog < mLogStats[sId].min) mLogStats[sId].min = dLog;
                                    if (!mLogStats[sId].max || dLog > mLogStats[sId].max) mLogStats[sId].max = dLog;
                                }
                            });

                            // Apply log dates to WBS (Only EndActual, StartActual is strictly from DB)
                            aResults.forEach(function (item) {
                                var stats = mLogStats[item.WbsId];
                                if (stats) {
                                    if (stats.max) item.EndActual = stats.max;
                                }
                            });

                            // Aggregate Actual Dates bottom-up
                            var mAllWbs = {};
                            aResults.forEach(function (w) { mAllWbs[w.WbsId] = w; });
                            var fnUpdateParentRecursive = function (item) {
                                var sPid = item.ParentId;
                                if (!sPid || String(sPid).replace(/-/g, "").replace(/0/g, "") === "") return;
                                var parent = mAllWbs[sPid];
                                if (!parent) return;
                                var bChanged = false;
                                if (item.StartActual && (!parent.StartActual || item.StartActual < parent.StartActual)) {
                                    parent.StartActual = item.StartActual;
                                    bChanged = true;
                                }
                                if (item.EndActual && (!parent.EndActual || item.EndActual > parent.EndActual)) {
                                    parent.EndActual = item.EndActual;
                                    bChanged = true;
                                }
                                if (bChanged) fnUpdateParentRecursive(parent);
                            };
                            aResults.forEach(function (item) { fnUpdateParentRecursive(item); });

                            // UPDATE UI NON-BLOCKINGLY: Update the specific models for the Gantt Gantt
                            var oViewData = that.getView().getModel("viewData");
                            var aTreeData = that._transformToTree(aResults);
                            var oGanttConfig = that._oWBSDelegate.prepareGanttData(aTreeData);
                            oViewData.setProperty("/WBS", aTreeData);
                            that.getView().getModel("viewConfig").setData(oGanttConfig);
                        },
                        error: function (oError) {
                            console.error("Error silently reading DailyLogSet for Gantt:", oError);
                        }
                    });
                },
                error: function (oError) {
                    oView.setBusy(false);
                    console.error("Error reading WBSSet:", oError);
                }
            });
        },

        _finalizeWbsLoad: function (aResults) {
            var that = this;
            var oView = this.getView();
            var oViewData = oView.getModel("viewData");
            var oModel = this.getOwnerComponent().getModel();

            // 1. Prepare Gantt Tree
            var aTreeData = that._transformToTree(aResults);
            var oGanttConfig = that._oWBSDelegate.prepareGanttData(aTreeData);
            oViewData.setProperty("/WBS", aTreeData);
            this.getView().getModel("viewConfig").setData(oGanttConfig);

            // 2. Filter Pending items for approval logic
            var aAllPending = aResults.filter(function (item) {
                return item.Status === "PENDING_OPEN" || item.Status === "PENDING_CLOSE";
            });

            var aGlobalPending = aAllPending.filter(function (item) {
                if (!item.ParentId) return true;
                var sPId = String(item.ParentId);
                var sParent = sPId.replace(/-/g, "").toLowerCase();
                if (/^0+$/.test(sParent) || sParent === "null" || sParent === "undefined") return true; 

                var aItemLogs = (item.ToApprovalLog && item.ToApprovalLog.results) ? item.ToApprovalLog.results : [];
                var bHasOwnLog = aItemLogs.some(function (l) {
                    var sAct = (l.Action || "").toUpperCase();
                    return sAct.indexOf("GỬI") !== -1 && sAct.indexOf("YÊU CẦU") !== -1;
                });
                if (bHasOwnLog) return true;

                var sNormParent = item.ParentId.toLowerCase().replace(/-/g, "");
                var bParentPending = aAllPending.some(function (p) {
                    return p.WbsId.toLowerCase().replace(/-/g, "") === sNormParent;
                });
                return !bParentPending;
            });

            if (aGlobalPending.length === 0) {
                oViewData.setProperty("/pendingOpenWBS", []);
                oViewData.setProperty("/pendingCloseWBS", []);
                oViewData.setProperty("/pendingWBS", []);
                oView.setBusy(false);
                return;
            }

            // Asynchronously check actionability via CheckDecision
            var aActionablePending = [];
            var iChecked = 0;
            var iPendingCount = aGlobalPending.length;

            var fnCheckDone = function () {
                iChecked++;
                if (iChecked === iPendingCount) {
                    var aOpen = aActionablePending.filter(function (w) { return w.Status.indexOf("OPEN") !== -1; });
                    var aClose = aActionablePending.filter(function (w) { return w.Status.indexOf("CLOSE") !== -1; });
                    oViewData.setProperty("/pendingOpenWBS", aOpen);
                    oViewData.setProperty("/pendingCloseWBS", aClose);
                    oViewData.setProperty("/pendingWBS", aActionablePending);
                    oView.setBusy(false);
                }
            };

            aGlobalPending.forEach(function (wbs) {
                var sType = wbs.Status && wbs.Status.indexOf("CLOSE") !== -1 ? "CLOSE" : "OPEN";

                // Populate Sender info from logs
                var aLogs = (wbs.ToApprovalLog && wbs.ToApprovalLog.results) ? wbs.ToApprovalLog.results : [];
                if (aLogs.length > 0) {
                    // Filter logs to match the current pending action type (OPEN or CLOSE)
                    var aTypeLogs = aLogs.filter(function(l) { return l.ApprovalType === sType; });
                    if (aTypeLogs.length > 0) {
                        var aSortedLogs = aTypeLogs.slice().sort(function (a, b) {
                            var tA = a.CreatedTimestamp ? parseInt((a.CreatedTimestamp.toString() || "").replace(/[^0-9]/g, ""), 10) || 0 : 0;
                            var tB = b.CreatedTimestamp ? parseInt((b.CreatedTimestamp.toString() || "").replace(/[^0-9]/g, ""), 10) || 0 : 0;
                            return tB - tA; // Newest first
                        });

                        // The Sender is whoever performed the LAST valid action before the system routed it to the current user
                        var oSenderLog = aSortedLogs.find(function (l) {
                            var sAct = (l.Action || "").toUpperCase();
                            var sBy = (l.ActionBy || "").toUpperCase();
                            
                            // Skip automated routing and receipt logs
                            var bIsReceiverLog = sAct === "0000" || 
                                                 sBy === "WF-BATCH" || 
                                                 sAct.indexOf("ĐÃ NHẬN YÊU CẦU") !== -1 || 
                                                 sAct.indexOf("ĐÃ CHUYỂN LUỒNG") !== -1;
                            
                            return !bIsReceiverLog;
                        });

                        // Fallback: Use the oldest log (the original submitter) if no sender log found
                        if (!oSenderLog) oSenderLog = aSortedLogs[aSortedLogs.length - 1];

                        if (oSenderLog) {
                            wbs.SenderName = oSenderLog.ActionBy || oSenderLog.CreatedBy || "";
                            var sTime = oSenderLog.CreatedTimestamp;
                            if (sTime) {
                                if (typeof sTime === 'string' && sTime.indexOf('/Date(') === 0) wbs.SendTime = new Date(parseInt(sTime.substr(6)));
                                else wbs.SendTime = new Date(sTime);
                            }
                        }
                    }
                }

                oModel.callFunction("/CheckDecision", {
                    method: "POST",
                    changeSetId: "CheckDecision_" + wbs.WbsId.replace(/-/g, ""),
                    urlParameters: { WBS_IDS: wbs.WbsId, ApprovalType: sType },
                    success: function (oResponse) {
                        var oResult = oResponse.CheckDecision || (oResponse.results && oResponse.results.CheckDecision) || oResponse;
                        var sWiId = (oResult && oResult.WORKITEM_ID) ? oResult.WORKITEM_ID : "";
                        if (sWiId && sWiId !== "" && sWiId !== "000000000000") aActionablePending.push(wbs);
                        fnCheckDone();
                    },
                    error: function () { fnCheckDone(); }
                });
            });
        },

        // _computeAndPatchSiteAndProjectStatus function has been removed as Backend now handles it

        onNavBack: function () {
            var oCtx = this.getView().getBindingContext();
            var sProjectId = oCtx ? oCtx.getProperty("ProjectId") : "";
            if (sProjectId) {
                this.getOwnerComponent().getRouter().navTo("Site", { project_id: sProjectId }, true);
            } else {
                this.getOwnerComponent().getRouter().navTo("RouteMain", {}, true);
            }
        },

        // ── WBS: CREATE (3-Level: Root → Parent → Child) ────────
        onAddWbs: function () {
            var oBundle = this.getView().getModel("i18n").getResourceBundle();
            // Permission check: ZBT_WBS — AuthLevel 1 or 99
            if (!this._checkWbsSitePermission()) {
                sap.m.MessageBox.error(oBundle.getText("wbsPermissionError"));
                return;
            }

            var oTable = this.byId("wbsTreeTable");
            var aIndices = oTable ? oTable.getSelectedIndices() : [];

            if (aIndices.length > 1) {
                MessageToast.show(oBundle.getText("selectOneChildWbsError"));
                return;
            }

            if (aIndices.length === 1) {
                // A row is selected → create as child of that row
                var oCtx = oTable.getContextByIndex(aIndices[0]);
                var sParentId = oCtx ? oCtx.getProperty("WbsId") : null;
                var sParentName = oCtx ? oCtx.getProperty("WbsName") : "";

                // Determine depth of selected row
                var iDepth = this._getWbsDepth(sParentId);

                if (iDepth >= 2) {
                    // Selected row is already a leaf (depth 2 = Child), cannot go deeper
                    sap.m.MessageBox.warning(oBundle.getText("cannotAddSubWbsError"));
                    return;
                }

                // depth 0 (Root) → creating Parent (level 2)
                // depth 1 (Parent) → creating Child (level 3)
                this._openWbsDialog(null, sParentId, sParentName);
            } else {
                // No row selected → create as Root WBS
                // FE check: only 1 Root per Site
                var aTree = this.getView().getModel("viewData").getProperty("/WBS") || [];
                if (aTree.length > 0) {
                    sap.m.MessageBox.warning(oBundle.getText("rootWbsAlreadyExistsError"));
                    return;
                }
                this._openWbsDialog(null, null, null);
            }

            // Clear selections to ensure a fresh state after action
            if (oTable) { oTable.clearSelection(); }
        },

        // ── WBS: EDIT ────────────────────────────────────────────────────────
        onEditWbs: function () {
            var oBundle = this.getView().getModel("i18n").getResourceBundle();
            // Permission check: ZBT_WBS — AuthLevel 1 or 99
            if (!this._checkWbsSitePermission()) {
                sap.m.MessageBox.error(oBundle.getText("wbsPermissionError"));
                return;
            }

            var oTable = this.byId("wbsTreeTable");
            var aIndices = oTable ? oTable.getSelectedIndices() : [];

            if (aIndices.length === 0) {
                MessageToast.show(oBundle.getText("selectWbsToEditError"));
                return;
            } else if (aIndices.length > 1) {
                MessageToast.show(oBundle.getText("selectOneWbsToEditError"));
                return;
            }

            var oCtx = oTable.getContextByIndex(aIndices[0]);

            // Validate WBS Status: Only allow editing if Status is PLANNING or OPEN_REJECTED
            var sStatus = oCtx.getProperty("Status");
            if (sStatus !== "PLANNING" && sStatus !== "OPEN_REJECTED") {
                sap.m.MessageBox.error(oBundle.getText("wbsEditPlanningOnlyError"));
                return;
            }

            // Clear selection before opening dialog
            if (oTable) { oTable.clearSelection(); }
            this._openWbsDialog(oCtx, null, null);
        },

        // ── WBS: DELETE ───────────────────────────────────────────────────────
        onDeleteWbs: function () {
            var oBundle = this.getView().getModel("i18n").getResourceBundle();
            // Permission check: ZBT_WBS — AuthLevel 1 or 99
            if (!this._checkWbsSitePermission()) {
                sap.m.MessageBox.error(oBundle.getText("wbsPermissionError"));
                return;
            }

            var oTable = this.byId("wbsTreeTable");
            var aIndices = oTable ? oTable.getSelectedIndices() : [];

            if (aIndices.length === 0) {
                MessageToast.show(oBundle.getText("selectWbsToDeleteError"));
                return;
            }

            var that = this;
            var oModel = this.getOwnerComponent().getModel();

            // Collect all selected WBS details
            var aSelectedItems = aIndices.map(function (iIdx) {
                var oCtx = oTable.getContextByIndex(iIdx);
                return {
                    id: oCtx.getProperty("WbsId"),
                    name: oCtx.getProperty("WbsName")
                };
            });

            var sConfirmMsg = aSelectedItems.length === 1 ?
                oBundle.getText("deleteWbsConfirm", [aSelectedItems[0].name]) :
                oBundle.getText("deleteMultipleWbsConfirm", [aSelectedItems.length]);

            MessageBox.confirm(sConfirmMsg, {
                title: oBundle.getText("confirmDeleteWbs"),
                onClose: function (sAction) {
                    if (sAction === MessageBox.Action.OK) {
                        that.getView().setBusy(true);

                        var iCount = aSelectedItems.length;
                        var iSuccess = 0;
                        var iError = 0;

                        // Function to perform deletion sequentially (one by one)
                        // This avoids "one operation per changeset" issues on the backend.
                        var fnDeleteNext = function (iIndex) {
                            if (iIndex >= iCount) {
                                // All items processed
                                that.getView().setBusy(false);
                                if (iError === 0) {
                                    var sSuccessMsg = iCount === 1 ?
                                        oBundle.getText("wbsDeletedSuccess", [aSelectedItems[0].name]) :
                                        oBundle.getText("wbsMultipleDeletedSuccess", [iCount]);
                                    MessageToast.show(sSuccessMsg);
                                } else {
                                    // Use partial error message if some failed
                                    MessageBox.error(oBundle.getText("submitPartialError", [iError]));
                                }
                                oTable.clearSelection();
                                that._loadWbsData();
                                return;
                            }

                            var item = aSelectedItems[iIndex];
                            oModel.remove("/WBSSet(guid'" + item.id + "')", {
                                success: function () {
                                    iSuccess++;
                                    fnDeleteNext(iIndex + 1);
                                },
                                error: function (oError) {
                                    iError++;
                                    console.error("Error deleting WBS: " + item.id, oError);
                                    fnDeleteNext(iIndex + 1);
                                }
                            });
                        };

                        // Start sequential deletion from the first item
                        fnDeleteNext(0);
                    }
                }
            });
        },

        // ── WBS: APPROVAL FLOW ──────────────────────────────────────────────
        onSubmitOpenWbsApproval: function () {
            var that = this;
            var oTable = this.byId("wbsTreeTable");
            var aIndices = oTable ? oTable.getSelectedIndices() : [];

            var oBundle = this.getView().getModel("i18n").getResourceBundle();
            if (aIndices.length === 0) {
                MessageToast.show(oBundle.getText("selectWbsForOpenApprovalError"));
                return;
            }

            var aInvalidItems = [];
            aIndices.forEach(function (iIdx) {
                var oCtx = oTable.getContextByIndex(iIdx);
                var oData = oCtx.getObject();
                if (oData.Status !== "PLANNING" && oData.Status !== "OPEN_REJECTED") {
                    aInvalidItems.push(oData.WbsName + " (Status: " + oData.Status + ")");
                }
            });

            if (aInvalidItems.length > 0) {
                MessageBox.error(oBundle.getText("planningOnlyOpenApprovalError", [aInvalidItems.join("\n- ")]));
                return;
            }

            MessageBox.confirm(oBundle.getText("submitOpenApprovalConfirm", [aIndices.length]), {
                onClose: function (sAction) {
                    if (sAction === MessageBox.Action.OK) {
                        that._submitMultipleWbs(aIndices, false);
                    }
                }
            });
        },

        onSubmitCloseWbsApproval: function () {
            var that = this;
            var oTable = this.byId("wbsTreeTable");
            var aIndices = oTable ? oTable.getSelectedIndices() : [];

            var oBundle = this.getView().getModel("i18n").getResourceBundle();
            if (aIndices.length === 0) {
                MessageToast.show(oBundle.getText("selectWbsForCloseApprovalError"));
                return;
            }

            // Check if all selected items are in IN_PROGRESS or CLOSE_REJECTED status
            var aInvalidItems = [];
            aIndices.forEach(function (iIdx) {
                var oCtx = oTable.getContextByIndex(iIdx);
                var oData = oCtx.getObject();
                if (oData.Status !== "IN_PROGRESS" && oData.Status !== "CLOSE_REJECTED") {
                    aInvalidItems.push(oData.WbsName + " (Status: " + oData.Status + ")");
                }
            });

            if (aInvalidItems.length > 0) {
                MessageBox.error(oBundle.getText("inProgressOnlyCloseApprovalError", [aInvalidItems.join("\n- ")]));
                return;
            }

            MessageBox.confirm(oBundle.getText("submitCloseApprovalConfirm", [aIndices.length]), {
                onClose: function (sAction) {
                    if (sAction === MessageBox.Action.OK) {
                        that._submitMultipleWbs(aIndices, true);
                    }
                }
            });
        },

        _submitMultipleWbs: function (aIndices, bIsClose) {
            var that = this;
            var oTable = this.byId("wbsTreeTable");
            var oModel = this.getOwnerComponent().getModel();

            this.getView().setBusy(true);

            var aWbsIds = [];

            // Sort indices ascending to ensure top-down processing order
            aIndices.sort(function (a, b) { return a - b; });

            aIndices.forEach(function (iIdx) {
                var oCtx = oTable.getContextByIndex(iIdx);
                var oData = oCtx.getObject();
                if (oData && oData.WbsId) {
                    aWbsIds.push(oData.WbsId);
                }
            });

            var sWbsIdsStr = aWbsIds.join(",");

            // --- NEW API CODE ---
            var sApprovalType = bIsClose ? "CLOSE" : "OPEN";
            var oParamsNew = { WbsIds: sWbsIdsStr, ApprovalType: sApprovalType };

            oModel.callFunction("/ApproveWbs", {
                method: "POST",
                urlParameters: oParamsNew,
                success: function (oData) {
                    that.getView().setBusy(false);
                    oTable.clearSelection();
                    that._loadWbsData();
                    oModel.refresh(true, true);
                    var oBundle = that.getView().getModel("i18n").getResourceBundle();

                    var aResults = oData.results || (oData.ApproveWbs && oData.ApproveWbs.results) || [];
                    if (!aResults || aResults.length === 0) {
                        sap.m.MessageToast.show(oBundle.getText("submissionExecutedOk"));
                        return;
                    }

                    // Ưu tiên đọc WbsName từ Backend (nếu BE thêm field mới), hoặc đọc luôn nội dung ở trường WbsCode
                    aResults.forEach(function (oRes) {
                        oRes.WbsNameDisplay = oRes.WbsName || oRes.WbsCode || "Unknown";
                    });

                    var sSuccessTxt = oBundle.getText("successStatus");
                    var sErrorTxt = oBundle.getText("errorStatus");
                    var sWarnTxt = oBundle.getText("warningStatus");

                    // Dynamically create the result table dialog
                    var oResultModel = new sap.ui.model.json.JSONModel({ items: aResults });
                    var oTableDialog = new sap.m.Table({
                        columns: [
                            new sap.m.Column({ header: new sap.m.Label({ text: oBundle.getText("wbsNameCol") }) }),
                            new sap.m.Column({ header: new sap.m.Label({ text: oBundle.getText("statusCol") }), width: "120px" }),
                            new sap.m.Column({ header: new sap.m.Label({ text: oBundle.getText("detailCol") }) })
                        ]
                    });

                    oTableDialog.setModel(oResultModel);
                    oTableDialog.bindItems({
                        path: "/items",
                        template: new sap.m.ColumnListItem({
                            cells: [
                                new sap.m.Text({ text: "{WbsNameDisplay}" }),
                                new sap.m.ObjectStatus({
                                    text: "{= ${ReturnType} === 'S' ? '" + sSuccessTxt + "' : (${ReturnType} === 'E' ? '" + sErrorTxt + "' : '" + sWarnTxt + "') }",
                                    state: "{= ${ReturnType} === 'S' ? 'Success' : (${ReturnType} === 'E' ? 'Error' : 'Warning') }"
                                }),
                                new sap.m.Text({ text: "{Message}" })
                            ]
                        })
                    });

                    var oDialog = new sap.m.Dialog({
                        title: oBundle.getText("batchApprovalResultTitle"),
                        contentWidth: "750px",
                        content: [oTableDialog],
                        endButton: new sap.m.Button({
                            text: oBundle.getText("closeBtn"),
                            press: function () {
                                oDialog.close();
                            }
                        }),
                        afterClose: function () {
                            oDialog.destroy();
                        }
                    });

                    that.getView().addDependent(oDialog);
                    oDialog.open();
                },
                error: function (oError) {
                    that.getView().setBusy(false);
                    that._showError(oError, "wbsSubmitError");
                }
            });
            // --- END NEW API CODE ---
        },

        // ── WBS: RUN (Switch from OPENED to IN_PROGRESS) ─────────────────────
        onRunWbs: function () {
            var oBundle = this.getView().getModel("i18n").getResourceBundle();
            // Permission check: ZBT_WBS — AuthLevel 1 or 99
            if (!this._checkWbsSitePermission()) {
                sap.m.MessageBox.error(oBundle.getText("wbsPermissionError"));
                return;
            }

            var oTable = this.byId("wbsTreeTable");
            var aIndices = oTable ? oTable.getSelectedIndices() : [];

            if (aIndices.length === 0) {
                MessageToast.show(oBundle.getText("selectWbsToRunError"));
                return;
            }

            var dToday = new Date();
            dToday.setHours(0, 0, 0, 0);
            var that = this;
            var oModel = this.getOwnerComponent().getModel();

            // 1. Collect and validate all selected WBS
            var aValid = [];
            var aSkipped = [];
            var aEarly = [];

            aIndices.forEach(function (iIdx) {
                var oCtx = oTable.getContextByIndex(iIdx);
                if (!oCtx) return;
                var oData = oCtx.getObject();

                if (oData.Status !== "OPENED") {
                    aSkipped.push(oData.WbsName + " (" + oBundle.getText("openedOnlyRunError", [oData.Status]) + ")");
                } else {
                    // Early start is allowed with confirmation (no longer skipped)
                    aValid.push(oData);
                    if (oData.StartDate && new Date(oData.StartDate) > dToday) {
                        aEarly.push(oData.WbsName + " (" + that.formatDate(oData.StartDate) + ")");
                    }
                }
            });

            if (aSkipped.length > 0 && aValid.length === 0) {
                MessageBox.warning(oBundle.getText("runWbsAllSkipped") + "\n\n" + aSkipped.map(function (s) { return "○ " + s; }).join("\n"));
                return;
            }

            if (aValid.length === 0) {
                MessageToast.show(oBundle.getText("selectWbsToRunError"));
                return;
            }

            // 2. Show confirmation listing all valid WBS names
            var sNames = aValid.map(function (o) { return "• " + o.WbsName; }).join("\n");
            var sConfirmMsg = oBundle.getText("runMultiWbsConfirm", [aValid.length]) + "\n\n" + sNames;

            if (aEarly.length > 0) {
                sConfirmMsg += "\n\n" + oBundle.getText("runWbsEarlyWarning") + "\n" + aEarly.map(function (n) { return "⚠ " + n; }).join("\n");
            }

            if (aSkipped.length > 0) {
                sConfirmMsg += "\n\n" + oBundle.getText("runWbsSkippedNote", [aSkipped.length]) + "\n" + aSkipped.map(function (s) { return "○ " + s; }).join("\n");
            }

            // 3. Dependency check then confirm
            var fnRunAll = function () {
                MessageBox.confirm(sConfirmMsg, {
                    title: oBundle.getText("confirmRunWbs"),
                    onClose: function (sAction) {
                        if (sAction !== MessageBox.Action.OK) return;

                        that.getView().setBusy(true);
                        var aSuccess = [];
                        var aFailed = [];

                        // Run sequentially: reduce into a Promise chain
                        aValid.reduce(function (pChain, oWbs) {
                            return pChain.then(function () {
                                return new Promise(function (resolve) {
                                    oModel.callFunction("/UpdateStatus", {
                                        method: "POST",
                                        urlParameters: {
                                            ObjectType: "WBS",
                                            ObjectId: oWbs.WbsId,
                                            NewStatus: "IN_PROGRESS"
                                        },
                                        success: function (oData) {
                                            // SAP UI5 OData V2: unwraps d{} but may keep function name as key
                                            var oResult = (oData && oData.UpdateStatus) ? oData.UpdateStatus : oData;
                                            var sSuccessVal = oResult ? String(oResult.Success).toLowerCase() : "false";
                                            var sMsg = (oResult && oResult.Message) ? oResult.Message : "";
                                            console.log("[RunWbs] Response for", oWbs.WbsName, ":", JSON.stringify(oResult));
                                            if (sSuccessVal === "true" || sSuccessVal === "1") {
                                                aSuccess.push(oWbs.WbsName);
                                            } else {
                                                // If backend message is empty, show a generic reason
                                                if (!sMsg) {
                                                    sMsg = oBundle.getText("runWbsFailedDefault") || "Không thể bắt đầu. Có thể do điều kiện tiên quyết chưa hoàn thành hoặc trạng thái chưa phù hợp.";
                                                }
                                                aFailed.push(oWbs.WbsName + ": " + sMsg);
                                            }
                                            resolve();
                                        },
                                        error: function (oError) {
                                            var sErrMsg = "";
                                            try {
                                                var oResp = JSON.parse(oError.responseText);
                                                if (oResp.error && oResp.error.message) {
                                                    sErrMsg = oResp.error.message.value || oResp.error.message || "";
                                                } else if (oResp.d && oResp.d.UpdateStatus) {
                                                    sErrMsg = oResp.d.UpdateStatus.Message || "";
                                                }
                                            } catch (e) {
                                                sErrMsg = oError.message || "";
                                            }
                                            console.log("[RunWbs] HTTP Error for", oWbs.WbsName, ":", sErrMsg, oError.statusCode);
                                            aFailed.push(oWbs.WbsName + (sErrMsg ? ": " + sErrMsg : ""));
                                            resolve(); // Don't break chain on error
                                        }
                                    });
                                });
                            });
                        }, Promise.resolve()).then(function () {
                            that.getView().setBusy(false);
                            oTable.clearSelection();

                            // Build summary message
                            var sSummary = "";
                            if (aSuccess.length > 0) {
                                sSummary += oBundle.getText("runWbsMultiSuccess", [aSuccess.length]) + "\n" +
                                    aSuccess.map(function (n) { return "✓ " + n; }).join("\n");
                            }
                            if (aFailed.length > 0) {
                                if (sSummary) sSummary += "\n\n";
                                sSummary += oBundle.getText("runWbsMultiFailed", [aFailed.length]) + "\n" +
                                    aFailed.map(function (n) { return "✗ " + n; }).join("\n");
                            }

                            if (aFailed.length === 0) {
                                MessageToast.show(oBundle.getText("runWbsMultiSuccess", [aSuccess.length]));
                            } else {
                                MessageBox.warning(sSummary);
                            }

                            that._loadWbsData();
                            oModel.refresh(true);
                        });
                    }
                });
            };

            // Run dependency validation only for the first valid WBS (or skip if not available)
            if (typeof that.validateDependencyOnRun === "function" && aValid.length === 1) {
                that.validateDependencyOnRun(aValid[0].WbsId).then(fnRunAll).catch(function (sMsg) {
                    MessageBox.error(sMsg, { title: oBundle.getText("depDependencyViolationTitle") || "Dependency Constraint" });
                });
            } else {
                fnRunAll();
            }
        },


        // ── WBS: PENDING APPROVAL LOGIC ───────────────────────────────────────
        onApproveWbs: function () {
            this._processPendingWbs("0001"); // 0001 = Approve
        },

        onRejectWbs: function () {
            this._processPendingWbs("0002"); // 0002 = Reject
        },

        _processPendingWbs: function (sDecisionCode) {
            var that = this;
            var oTable = this.byId("pendingApprovalTable");
            var aSelectedItems = oTable.getSelectedItems();
            var oBundle = this.getView().getModel("i18n").getResourceBundle();
            var oModel = this.getOwnerComponent().getModel();

            if (aSelectedItems.length === 0) {
                MessageToast.show(oBundle.getText("selectPendingWbsError"));
                return;
            }

            var aWbsObjects = aSelectedItems.map(function (oItem) {
                return oItem.getBindingContext("viewData").getObject();
            });

            this.getView().setBusy(true);

            // Helper: extract WorkItemId from an array of ApprovalLog entries (most-recent-first in current cycle)
            // IMPORTANT: WorkItemId may be stored on the "Gửi yêu cầu" (submit) row itself,
            // so we capture it BEFORE breaking when we hit a cycle-reset action.
            var fnExtractFromLogArray = function (aLogs) {
                if (!aLogs || aLogs.length === 0) return null;
                var aSorted = aLogs.slice().sort(function (a, b) {
                    var tA = a.CreatedTimestamp ? parseInt((a.CreatedTimestamp.toString() || "").replace(/[^0-9]/g, ""), 10) || 0 : 0;
                    var tB = b.CreatedTimestamp ? parseInt((b.CreatedTimestamp.toString() || "").replace(/[^0-9]/g, ""), 10) || 0 : 0;
                    return tB - tA;
                });

                var sFound = null;
                for (var i = 0; i < aSorted.length; i++) {
                    console.log("ROW " + i + ": Act=" + aSorted[i].Action + " Lvl=" + aSorted[i].ApprovalLevel + " WI_ID=" + aSorted[i].WorkItemId);
                    // Grab any WorkItemId we find along the way
                    if (aSorted[i].WorkItemId && !sFound) {
                        sFound = aSorted[i].WorkItemId;
                    }
                    var sAct = (aSorted[i].Action || "").toUpperCase().trim();
                    var bIsReset = sAct === "0000" || sAct === "SUBMITTED" || sAct === "TẠO WBS" ||
                        (sAct.indexOf("GỬI") !== -1 && sAct.indexOf("YÊU CẦU") !== -1);
                    // After capturing WorkItemId, stop scanning older logs
                    if (bIsReset) break;
                }
                return sFound;
            };

            // Tier-2 fallback: try ToApprovalLog expand on the WBS object
            var fnExpandFallback = function (oWbs) {
                var aLogs = (oWbs.ToApprovalLog && oWbs.ToApprovalLog.results) ? oWbs.ToApprovalLog.results : [];
                return fnExtractFromLogArray(aLogs);
            };

            // Tier-3 fallback: fetch /ApprovalLogSet directly if previous tiers failed
            var fnDirectFetch = function (oWbs, fnCallback) {
                var sWbsId = oWbs.WbsId;
                var sType = oWbs.Status && oWbs.Status.indexOf("CLOSE") !== -1 ? "CLOSE" : "OPEN";
                oModel.read("/ApprovalLogSet", {
                    filters: [
                        new Filter("WbsId", FilterOperator.EQ, sWbsId),
                        new Filter("ApprovalType", FilterOperator.EQ, sType)
                    ],
                    sorters: [new sap.ui.model.Sorter("CreatedTimestamp", true)],
                    urlParameters: { "cb": new Date().getTime() },
                    success: function (oData) {
                        var aLogs = (oData.results || []).filter(function (l) {
                            return l.WbsId && l.WbsId.toLowerCase() === sWbsId.toLowerCase();
                        });
                        fnCallback(fnExtractFromLogArray(aLogs) || "");
                    },
                    error: function () { fnCallback(""); }
                });
            };

            // Resolution list
            var aResolved = [];
            var iDone = 0;

            var fnCheckNext = function () {
                if (iDone === aWbsObjects.length) {
                    that.getView().setBusy(false);
                    that._openApproveDialog(aResolved, sDecisionCode, oBundle);
                    return;
                }

                var oWbs = aWbsObjects[iDone];
                var sType = oWbs.Status && oWbs.Status.indexOf("CLOSE") !== -1 ? "CLOSE" : "OPEN";

                var fnOnChecked = function (sWiId) {
                    if (sWiId && sWiId !== "" && sWiId !== "000000000000") {
                        aResolved.push({ WorkItemId: sWiId, WbsName: oWbs.WbsName });
                    }
                    iDone++;
                    fnCheckNext();
                };

                // Tier-1: Call CheckDecision
                oModel.callFunction("/CheckDecision", {
                    method: "POST",
                    urlParameters: { WBS_IDS: oWbs.WbsId, ApprovalType: sType },
                    changeSetId: oWbs.WbsId,
                    success: function (oResponse) {
                        var oResult = oResponse.CheckDecision || (oResponse.results && oResponse.results.CheckDecision) || oResponse;
                        var sWiId = (oResult && oResult.WORKITEM_ID) ? oResult.WORKITEM_ID : "";

                        if (!sWiId || sWiId === "" || sWiId === "000000000000") {
                            // Tier-2: ToApprovalLog expand
                            sWiId = fnExpandFallback(oWbs) || "";
                        }

                        if (!sWiId || sWiId === "" || sWiId === "000000000000") {
                            // Tier-3: Direct fetch from ApprovalLogSet
                            fnDirectFetch(oWbs, function (sResolved) {
                                fnOnChecked(sResolved);
                            });
                        } else {
                            fnOnChecked(sWiId);
                        }
                    },
                    error: function () {
                        // Tier-2 on CheckDecision error
                        var sWiId = fnExpandFallback(oWbs) || "";
                        if (!sWiId || sWiId === "" || sWiId === "000000000000") {
                            // Tier-3
                            fnDirectFetch(oWbs, function (sResolved) {
                                fnOnChecked(sResolved);
                            });
                        } else {
                            fnOnChecked(sWiId);
                        }
                    }
                });
            };

            // Start sequential Tiered Check
            fnCheckNext();
        },

        _openApproveDialog: function (aItemsToProcess, sDecisionCode, oBundle) {
            if (!aItemsToProcess || aItemsToProcess.length === 0) {
                MessageBox.error(oBundle.getText("workItemIdNotFoundError"));
                return;
            }

            if (!this._oApproveDialog) {
                this._oApproveDialog = new Dialog({
                    title: oBundle.getText("decisionNote"),
                    type: "Message",
                    content: [
                        new Label({ text: oBundle.getText("decisionCommentLabel"), labelFor: "approveNote" }),
                        new TextArea("approveNote", {
                            width: "100%",
                            placeholder: oBundle.getText("decisionNotePlaceholder"),
                            rows: 4
                        })
                    ],
                    beginButton: new Button({
                        text: oBundle.getText("submit"),
                        type: "Emphasized",
                        press: function () {
                            var sUserNote = sap.ui.getCore().byId("approveNote").getValue();
                            if (this._sPendingDecision === "0002" && (!sUserNote || sUserNote.trim() === "")) {
                                MessageBox.error(oBundle.getText("rejectReasonRequiredError"));
                                return;
                            }
                            this._oApproveDialog.close();
                            this._submitDecisionBatch(this._aPendingItems, this._sPendingDecision, sUserNote);
                        }.bind(this)
                    }),
                    endButton: new Button({
                        text: oBundle.getText("cancel"),
                        press: function () {
                            this._oApproveDialog.close();
                        }.bind(this)
                    })
                });
                this.getView().addDependent(this._oApproveDialog);
            }

            this._sPendingDecision = sDecisionCode;
            this._aPendingItems = aItemsToProcess;
            sap.ui.getCore().byId("approveNote").setValue("");
            this._oApproveDialog.open();
        },


        _submitDecisionBatch: function (aItems, sDecision, sUserNote) {
            var that = this;
            var oModel = this.getOwnerComponent().getModel();
            var iDone = 0;
            var iError = 0;
            var aTableResults = [];

            this.getView().setBusy(true);

            var fnNext = function () {
                var oBundle = that.getView().getModel("i18n").getResourceBundle();
                if (iDone + iError === aItems.length) {
                    that.getView().setBusy(false);
                    var oPendingTable = that.byId("pendingApprovalTable");
                    if (oPendingTable) {
                        oPendingTable.removeSelections(true);
                    }
                    that._loadWbsData();
                    // Status computation is now handled by Backend
                    oModel.refresh(true);

                    // Dynamically create the result table dialog specifically for Approval
                    var sSuccessTxt = oBundle.getText("successStatus");
                    var sErrorTxt = oBundle.getText("errorStatus");
                    var sWarnTxt = oBundle.getText("warningStatus");

                    var oResultModel = new sap.ui.model.json.JSONModel({ items: aTableResults });
                    var oTableDialog = new sap.m.Table({
                        columns: [
                            new sap.m.Column({ header: new sap.m.Label({ text: oBundle.getText("wbsNameCol") }) }),
                            new sap.m.Column({ header: new sap.m.Label({ text: oBundle.getText("statusCol") }), width: "120px" }),
                            new sap.m.Column({ header: new sap.m.Label({ text: oBundle.getText("detailCol") }) })
                        ]
                    });

                    oTableDialog.setModel(oResultModel);
                    oTableDialog.bindItems({
                        path: "/items",
                        template: new sap.m.ColumnListItem({
                            cells: [
                                new sap.m.Text({ text: "{WbsNameDisplay}" }),
                                new sap.m.ObjectStatus({
                                    text: "{= ${ReturnType} === 'S' ? '" + sSuccessTxt + "' : (${ReturnType} === 'E' ? '" + sErrorTxt + "' : '" + sWarnTxt + "') }",
                                    state: "{= ${ReturnType} === 'S' ? 'Success' : (${ReturnType} === 'E' ? 'Error' : 'Warning') }"
                                }),
                                new sap.m.Text({ text: "{Message}" })
                            ]
                        })
                    });

                    var oDialog = new sap.m.Dialog({
                        title: oBundle.getText("batchApprovalResultTitle"),
                        contentWidth: "750px",
                        content: [oTableDialog],
                        endButton: new sap.m.Button({
                            text: oBundle.getText("closeBtn"),
                            press: function () {
                                oDialog.close();
                            }
                        }),
                        afterClose: function () {
                            oDialog.destroy();
                        }
                    });

                    that.getView().addDependent(oDialog);
                    oDialog.open();
                    return;
                }

                var oItem = aItems[iDone + iError];

                oModel.callFunction("/PostDecision", {
                    method: "POST",
                    urlParameters: {
                        WI_ID: oItem.WorkItemId,
                        Decision: sDecision,
                        Note: sUserNote
                    },
                    changeSetId: oItem.WorkItemId,
                    success: function (oData) {
                        var oResult = oData.PostDecision || oData;
                        var sMsg = (oResult && oResult.MESSAGE) ? oResult.MESSAGE : "";
                        if (oResult && oResult.SUCCESS === false) {
                            iError++;
                            aTableResults.push({
                                WbsNameDisplay: oItem.WbsName,
                                ReturnType: "E",
                                Message: sMsg || oBundle.getText("processError")
                            });
                        } else {
                            iDone++;
                            aTableResults.push({
                                WbsNameDisplay: oItem.WbsName,
                                ReturnType: "S",
                                Message: sMsg || oBundle.getText("processSuccess", ["1"])
                            });
                        }
                        fnNext();
                    },
                    error: function (oError) {
                        iError++;
                        var sMsg = oBundle.getText("processError");
                        try {
                            var oErr = JSON.parse(oError.responseText);
                            sMsg = oErr.error.message.value || sMsg;
                        } catch (e) { }
                        aTableResults.push({
                            WbsNameDisplay: oItem.WbsName,
                            ReturnType: "E",
                            Message: sMsg
                        });
                        fnNext();
                    }
                });
            };

            fnNext();
        },

        // ── PRIVATE: Create/Edit WBS Dialog ───────────────────────────────────
        _openWbsDialog: function (oContext, sParentId, sParentName) {
            var that = this;
            var bEdit = !!oContext;
            var oModel = this.getOwnerComponent().getModel();
            var oBundle = this.getView().getModel("i18n").getResourceBundle();

            // Determine the depth level of this WBS node
            // bIsLeaf = true only for Level 3 ("Con") — depth 2, which requires Quantity/Unit
            var iNodeDepth = 0;
            var bIsLeaf = false;
            if (bEdit) {
                var sEditId = oContext.getProperty("WbsId");
                iNodeDepth = that._getWbsDepth(sEditId);
                bIsLeaf = (iNodeDepth >= 2);
            } else if (sParentId) {
                // Creating a child of sParentId — the NEW node's depth = parent depth + 1
                var iParentDepth = that._getWbsDepth(sParentId);
                iNodeDepth = iParentDepth + 1;
                bIsLeaf = (iNodeDepth >= 2);
            }
            // Keep bIsChild for backward compat in payload logic
            var bIsChild = bIsLeaf;

            var oLabelCode = new Label({ text: oBundle.getText("wbsCode"), visible: bEdit });
            var oInputCode = new Input({
                visible: bEdit,
                editable: false
            });
            var oInputName = new Input({
                placeholder: oBundle.getText("workItemName"),
                liveChange: function (oEvent) {
                    var oSource = oEvent.getSource();
                    oSource.setValueState("None");
                    oSource.setValueStateText("");
                }
            });
            var dToday = new Date();
            dToday.setHours(0, 0, 0, 0);

            var oPickerStart = new DatePicker({ width: "100%", displayFormat: "dd/MM/yyyy" });
            var oPickerEnd = new DatePicker({ width: "100%", displayFormat: "dd/MM/yyyy" });

            // Standardize: Disable manual keyboard input, force use of calendar icon
            var oReadonlyDelegate = {
                onAfterRendering: function () {
                    var oInput = this.$().find("input");
                    if (oInput.length > 0) {
                        oInput.attr("readonly", "readonly").css("cursor", "pointer");
                    }
                }
            };
            oPickerStart.addEventDelegate(oReadonlyDelegate, oPickerStart);
            oPickerEnd.addEventDelegate(oReadonlyDelegate, oPickerEnd);

            oPickerStart.attachChange(function (oEvent) {
                var oSource = oEvent.getSource();
                oSource.setValueState("None");
                oSource.setValueStateText("");
                var dNewStart = oSource.getDateValue();
                // Removed auto-setMinDate to allow 'cho chọn thoải mái' (selecting freely)
                // Logical validation will be handled on Save

            });

            oPickerEnd.attachChange(function (oEvent) {
                var oSource = oEvent.getSource();
                oSource.setValueState("None");
                oSource.setValueStateText("");
            });

            var oInputQty = new Input({
                type: "Number",
                placeholder: "0",
                visible: bIsChild,
                liveChange: function (oEvent) {
                    var oSource = oEvent.getSource();
                    oSource.setValueState("None");
                    oSource.setValueStateText("");
                }
            });

            var oInputUnit = new Input({
                width: "100%",
                visible: bIsChild,
                placeholder: oBundle.getText("resUnitPlaceholder"),
                showValueHelp: true,
                valueHelpRequest: function () {
                    that._openUnitValueHelpDialog(oInputUnit);
                },
                liveChange: function (oEvent) {
                    var oSource = oEvent.getSource();
                    oSource.setValueState("None");
                    oSource.setValueStateText("");
                },
                change: function (oEvent) {
                    var oSource = oEvent.getSource();
                    var sNormalized = (oSource.getValue() || "").trim();
                    oSource.setValue(sNormalized);
                }
            });
            var oSelectStatus = new Select({
                width: "100%",
                enabled: false,
                items: [
                    new Item({ key: "PLANNING", text: oBundle.getText("planningStatus") }),
                    new Item({ key: "PENDING_OPEN", text: oBundle.getText("pendingOpenStatus") || "Pending Open" }),
                    new Item({ key: "OPEN_REJECTED", text: oBundle.getText("openRejectedStatus") || "Open Rejected" }),
                    new Item({ key: "OPENED", text: oBundle.getText("openedStatus") || "Opened" }),
                    new Item({ key: "IN_PROGRESS", text: oBundle.getText("inProgressStatus") }),
                    new Item({ key: "PENDING_CLOSE", text: oBundle.getText("pendingCloseStatus") || "Pending Close" }),
                    new Item({ key: "CLOSE_REJECTED", text: oBundle.getText("closeRejectedStatus") || "Close Rejected" }),
                    new Item({ key: "CLOSED", text: oBundle.getText("closedStatus") || "Closed" })
                ],
                visible: false
            });

            var sDialogTitle;
            if (bEdit) {
                sDialogTitle = oBundle.getText("editWbs");
                oInputCode.setValue(oContext.getProperty("WbsCode"));
                oInputName.setValue(oContext.getProperty("WbsName"));
                var oStartRaw = oContext.getProperty("StartDate");
                var oEndRaw = oContext.getProperty("EndDate");
                var dStartObj = oStartRaw ? (oStartRaw instanceof Date ? oStartRaw : new Date(oStartRaw)) : null;
                var dEndObj = oEndRaw ? (oEndRaw instanceof Date ? oEndRaw : new Date(oEndRaw)) : null;

                if (dStartObj && !isNaN(dStartObj.getTime())) {
                    oPickerStart.setDateValue(dStartObj);
                }

                if (dEndObj && !isNaN(dEndObj.getTime())) {
                    if (dStartObj) {
                        var dMinEndFromStart = new Date(dStartObj);
                        dMinEndFromStart.setHours(0, 0, 0, 0);
                        dMinEndFromStart.setDate(dMinEndFromStart.getDate() + 1);
                        oPickerEnd.setMinDate(dMinEndFromStart);
                    }
                    oPickerEnd.setDateValue(dEndObj);
                }

                var sQty = oContext.getProperty("Quantity");
                if (sQty) oInputQty.setValue(parseFloat(sQty));
                oInputUnit.setValue((oContext.getProperty("UnitCode") || ""));
                oSelectStatus.setSelectedKey(oContext.getProperty("Status"));
            } else {
                if (!sParentId) {
                    sDialogTitle = oBundle.getText("createWbsRoot");
                } else if (iNodeDepth === 1) {
                    sDialogTitle = oBundle.getText("addChildWbsOf", [sParentName]);
                } else {
                    sDialogTitle = oBundle.getText("addLeafWbsOf", [sParentName]);
                }
                oSelectStatus.setSelectedKey("NEW");
            }

            var oStatusLabel = new Label({ text: oBundle.getText("status"), visible: false });

            var oForm = new SimpleForm({
                editable: true,
                layout: "ResponsiveGridLayout",
                labelSpanL: 4, labelSpanM: 4, labelSpanS: 12,
                columnsL: 1, columnsM: 1,
                content: [
                    oLabelCode, oInputCode,
                    new Label({ text: oBundle.getText("name"), required: true }), oInputName,
                    new Label({ text: oBundle.getText("startDate"), required: true }), oPickerStart,
                    new Label({ text: oBundle.getText("endDate"), required: true }), oPickerEnd,
                    new Label({ text: oBundle.getText("quantity"), required: bIsChild, visible: bIsChild }), oInputQty,
                    new Label({ text: oBundle.getText("unit"), required: bIsChild, visible: bIsChild }), oInputUnit,
                    oStatusLabel, oSelectStatus
                ]
            });

            // --- LOCATION TAB ---
            var oLocName = new Input({
                placeholder: oBundle.getText("locationPlaceholder"),
                liveChange: function (oEvent) {
                    var oControl = oEvent.getSource();
                    var sVal = oControl.getValue();
                    if (sVal && sVal.length > 100) {
                        oControl.setValueState("Warning");
                        oControl.setValueStateText(oBundle.getText("locationNameTooLong"));
                    } else {
                        oControl.setValueState("None");
                        oControl.setValueStateText("");
                    }
                }
            });
            var oLocStart = new Input({ type: "Number", placeholder: "0.000", liveChange: function (oEvent) { oEvent.getSource().setValueState("None"); } });
            var oLocEnd = new Input({ type: "Number", placeholder: "0.000", liveChange: function (oEvent) { oEvent.getSource().setValueState("None"); } });
            var oLocTop = new Input({ type: "Number", placeholder: "0.000", liveChange: function (oEvent) { oEvent.getSource().setValueState("None"); } });
            var oLocBot = new Input({ type: "Number", placeholder: "0.000", liveChange: function (oEvent) { oEvent.getSource().setValueState("None"); } });

            var sEditLocationId = null;
            if (bEdit) {
                var sEditWbsId = oContext.getProperty("WbsId");
                var sPath = "/LocationSet(guid'" + sEditWbsId + "')";
                oModel.read(sPath, {
                    success: function (oData) {
                        if (oData) {
                            sEditLocationId = oData.LocationId || oData.WbsId; // fallback
                            oLocName.setValue(oData.LocationName);
                            if (oData.PosStart) oLocStart.setValue(parseFloat(oData.PosStart));
                            if (oData.PosEnd) oLocEnd.setValue(parseFloat(oData.PosEnd));
                            if (oData.PosTop) oLocTop.setValue(parseFloat(oData.PosTop));
                            if (oData.PosBot) oLocBot.setValue(parseFloat(oData.PosBot));
                        }
                    },
                    error: function (e) { console.warn("Location not found or error fetching", e); }
                });
            }

            var oLocForm = new SimpleForm({
                editable: true,
                layout: "ResponsiveGridLayout",
                labelSpanL: 4, labelSpanM: 4, labelSpanS: 12,
                columnsL: 1, columnsM: 1,
                content: [
                    new Label({ text: oBundle.getText("locationName") }), oLocName,
                    new Label({ text: oBundle.getText("posStart") }), oLocStart,
                    new Label({ text: oBundle.getText("posEnd") }), oLocEnd,
                    new Label({ text: oBundle.getText("posTop") }), oLocTop,
                    new Label({ text: oBundle.getText("posBot") }), oLocBot
                ]
            });

            var oIconTabBar = new sap.m.IconTabBar({
                items: [
                    new sap.m.IconTabFilter({
                        text: oBundle.getText("wbsDetailTab"),
                        icon: "sap-icon://form",
                        content: [oForm]
                    }),
                    new sap.m.IconTabFilter({
                        text: oBundle.getText("locationTab"),
                        icon: "sap-icon://map",
                        content: [oLocForm]
                    })
                ]
            });

            var oDialog = new Dialog({
                title: sDialogTitle,
                contentWidth: "500px",
                content: [oIconTabBar],
                beginButton: new Button({
                    text: bEdit ? oBundle.getText("saveChanges") : oBundle.getText("createWbs"),
                    type: "Emphasized",
                    press: function () {
                        var sWbsCode = oInputCode.getValue().trim();
                        var sName = oInputName.getValue().trim();
                        var dStart = oPickerStart.getDateValue();
                        var dEnd = oPickerEnd.getDateValue();

                        var sQty = oInputQty.getValue();
                        var sUnitCode = (oInputUnit.getValue() || "").trim();

                        // Reset states
                        if (bEdit) {
                            oInputCode.setValueState("None");
                        }
                        oInputName.setValueState("None");
                        oPickerStart.setValueState("None");
                        oPickerEnd.setValueState("None");
                        oInputQty.setValueState("None");
                        oInputUnit.setValueState("None");
                        oInputUnit.setValueStateText("");

                        var bHasError = false;

                        // Check for duplicate WBS name
                        var bExists = false;
                        var aTree = that.getView().getModel("viewData").getProperty("/WBS") || [];
                        var sNameLower = sName.toLowerCase();
                        var _checkNode = function (nodes) {
                            for (var i = 0; i < nodes.length; i++) {
                                var isSelf = false;
                                if (bEdit && oContext) {
                                    isSelf = nodes[i].WbsId === oContext.getProperty("WbsId");
                                }
                                if (!isSelf && nodes[i].WbsName && nodes[i].WbsName.toLowerCase() === sNameLower) {
                                    bExists = true;
                                    break;
                                }
                                if (nodes[i].children && nodes[i].children.length > 0) {
                                    _checkNode(nodes[i].children);
                                }
                            }
                        };

                        if (sName) {
                            _checkNode(aTree);
                        }

                        var bHasWbsDetailError = false;

                        if (!sName) {
                            oInputName.setValueState("Error");
                            oInputName.setValueStateText(oBundle.getText("requireWbsName"));
                            bHasError = true;
                            bHasWbsDetailError = true;
                        } else if (bExists) {
                            oInputName.setValueState("Error");
                            oInputName.setValueStateText(oBundle.getText("wbsNameExistsError") || "Tên Hạng mục thi công đã tồn tại trong Công trình này. Vui lòng chọn tên khác.");
                            bHasError = true;
                            bHasWbsDetailError = true;
                        }
                        if (!dStart) {
                            oPickerStart.setValueState("Error");
                            oPickerStart.setValueStateText(oBundle.getText("requireWbsStartDate"));
                            bHasError = true;
                            bHasWbsDetailError = true;
                        }
                        if (!dEnd) {
                            oPickerEnd.setValueState("Error");
                            oPickerEnd.setValueStateText(oBundle.getText("requireWbsEndDate"));
                            bHasError = true;
                            bHasWbsDetailError = true;
                        }
                        var fQty = parseFloat(sQty);
                        if (bIsChild) {
                            if (!sQty) {
                                oInputQty.setValueState("Error");
                                oInputQty.setValueStateText(oBundle.getText("requireWbsQuantity"));
                                bHasError = true;
                                bHasWbsDetailError = true;
                            } else if (isNaN(fQty) || fQty <= 0) {
                                oInputQty.setValueState("Error");
                                oInputQty.setValueStateText(oBundle.getText("wbsQuantityZeroError"));
                                bHasError = true;
                                bHasWbsDetailError = true;
                            }

                            if (!sUnitCode) {
                                oInputUnit.setValueState("Error");
                                oInputUnit.setValueStateText(oBundle.getText("unitValCode"));
                                bHasError = true;
                                bHasWbsDetailError = true;
                            }
                        }

                        if (dStart && dEnd && dEnd <= dStart) {
                            oPickerEnd.setValueState("Error");
                            oPickerEnd.setValueStateText(oBundle.getText("wbsEndDateBeforeStartDateError"));
                            bHasError = true;
                            bHasWbsDetailError = true;
                        }

                        // --- Parent Date Validation ---
                        var sParentIdToLookup = bEdit ? oContext.getProperty("ParentId") : sParentId;
                        if (sParentIdToLookup && sParentIdToLookup !== "00000000-0000-0000-0000-000000000000") {
                            var oParentNode = that._findWbsById(aTree, sParentIdToLookup);
                            if (oParentNode) {
                                // 1. Validate End Date
                                if (oParentNode.EndDate) {
                                    var dParentEnd = (oParentNode.EndDate instanceof Date) ? oParentNode.EndDate : new Date(oParentNode.EndDate);
                                    var dCompareParentEnd = new Date(dParentEnd); dCompareParentEnd.setHours(0, 0, 0, 0);
                                    var dCompareWbsEnd = new Date(dEnd); dCompareWbsEnd.setHours(0, 0, 0, 0);

                                    if (dEnd && dCompareWbsEnd > dCompareParentEnd) {
                                        oPickerEnd.setValueState("Error");
                                        oPickerEnd.setValueStateText(oBundle.getText("wbsEndDateAfterParentError", [that.formatDate(dParentEnd)]));
                                        bHasError = true;
                                        bHasWbsDetailError = true;
                                    }
                                }
                                // 2. Validate Start Date
                                if (oParentNode.StartDate) {
                                    var dParentStart = (oParentNode.StartDate instanceof Date) ? oParentNode.StartDate : new Date(oParentNode.StartDate);
                                    var dCompareParentStart = new Date(dParentStart); dCompareParentStart.setHours(0, 0, 0, 0);
                                    var dCompareWbsStart = new Date(dStart); dCompareWbsStart.setHours(0, 0, 0, 0);

                                    if (dStart && dCompareWbsStart < dCompareParentStart) {
                                        oPickerStart.setValueState("Error");
                                        oPickerStart.setValueStateText(oBundle.getText("wbsStartDatePastParentError", [that.formatDate(dParentStart)]));
                                        bHasError = true;
                                        bHasWbsDetailError = true;
                                    }
                                }
                            }
                        }

                        // --- Step 1: If WBS Detail has errors, jump back to WBS tab and stop ---
                        if (bHasWbsDetailError) {
                            oIconTabBar.setSelectedKey(oIconTabBar.getItems()[0].getId());
                            return;
                        }

                        // --- Step 2: WBS Detail is valid. Now validate Location ---
                        var sLName = oLocName.getValue().trim();
                        var sLStartVal = oLocStart.getValue().trim();
                        var sLEndVal = oLocEnd.getValue().trim();
                        var sLTopVal = oLocTop.getValue().trim();
                        var sLBotVal = oLocBot.getValue().trim();
                        var fLStart = parseFloat(sLStartVal);
                        var fLEnd = parseFloat(sLEndVal);
                        var fLTop = parseFloat(sLTopVal);
                        var fLBot = parseFloat(sLBotVal);

                        var bLocationError = false;
                        var aLocationErrors = [];

                        // 1. Location Name: max 100 chars
                        if (sLName && sLName.length > 100) {
                            oLocName.setValueState("Error");
                            oLocName.setValueStateText(oBundle.getText("locationNameTooLong"));
                            if (aLocationErrors.indexOf(oBundle.getText("locationNameTooLong")) === -1) {
                                aLocationErrors.push(oBundle.getText("locationNameTooLong"));
                            }
                            bHasError = true;
                            bLocationError = true;
                        }



                        // 3. POS_START <= POS_END
                        if (!isNaN(fLStart) && !isNaN(fLEnd) && fLStart > fLEnd) {
                            oLocStart.setValueState("Error");
                            oLocStart.setValueStateText(oBundle.getText("posStartEndError"));
                            if (aLocationErrors.indexOf(oBundle.getText("posStartEndError")) === -1) {
                                aLocationErrors.push(oBundle.getText("posStartEndError"));
                            }
                            bHasError = true;
                            bLocationError = true;
                        }

                        // 4. POS_BOT <= POS_TOP
                        if (!isNaN(fLTop) && !isNaN(fLBot) && fLBot > fLTop) {
                            oLocBot.setValueState("Error");
                            oLocBot.setValueStateText(oBundle.getText("posBotTopError"));
                            if (aLocationErrors.indexOf(oBundle.getText("posBotTopError")) === -1) {
                                aLocationErrors.push(oBundle.getText("posBotTopError"));
                            }
                            bHasError = true;
                            bLocationError = true;
                        }

                        // --- Stop if Location has errors, switch to Location tab ---
                        if (bLocationError) {
                            oIconTabBar.setSelectedKey(oIconTabBar.getItems()[1].getId());
                            return;
                        }

                        // --- Project Date Validation ---
                        var oProjModel = that.getView().getModel("projectModel");
                        var oProjData = (oProjModel ? oProjModel.getData() : {}) || {};

                        var fnProceedSave = function (oProject) {
                            // --- Project Date Validation ---
                            var vProjStart = oProject.StartDate || oProject.start_date || oProject.PlannedStart;
                            var vProjEnd = oProject.EndDate || oProject.end_date || oProject.PlannedEnd;

                            var dProjStart = vProjStart ? (vProjStart instanceof Date ? vProjStart : new Date(vProjStart)) : null;
                            var dProjEnd = vProjEnd ? (vProjEnd instanceof Date ? vProjEnd : new Date(vProjEnd)) : null;

                            // Normalize both for comparison
                            var dCompareWbsStart = new Date(dStart); dCompareWbsStart.setHours(0, 0, 0, 0);
                            var dCompareWbsEnd = new Date(dEnd); dCompareWbsEnd.setHours(0, 0, 0, 0);

                            if (dProjStart) {
                                var dCompareProjStart = new Date(dProjStart); dCompareProjStart.setHours(0, 0, 0, 0);
                                if (dCompareWbsStart < dCompareProjStart) {
                                    oPickerStart.setValueState("Error");
                                    oPickerStart.setValueStateText(oBundle.getText("wbsStartDateBeforeProjectError", [that.formatDate(dProjStart)]));
                                    return;
                                }
                                if (dCompareWbsEnd < dCompareProjStart) {
                                    oPickerEnd.setValueState("Error");
                                    oPickerEnd.setValueStateText(oBundle.getText("wbsEndDateBeforeProjectStartError", [that.formatDate(dProjStart)]));
                                    return;
                                }
                            }

                            if (dProjEnd) {
                                var dCompareProjEnd = new Date(dProjEnd); dCompareProjEnd.setHours(0, 0, 0, 0);
                                if (dCompareWbsEnd > dCompareProjEnd) {
                                    oPickerEnd.setValueState("Error");
                                    oPickerEnd.setValueStateText(oBundle.getText("wbsEndDateAfterProjectError", [that.formatDate(dProjEnd)]));
                                    return;
                                }
                            }

                            // If validation passes, continue with existing save logic
                            var toUTC = function (d) {
                                return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
                            };

                            var fnExecuteActualSave = function () {
                                var oPayload = {
                                    WbsName: sName,
                                    StartDate: toUTC(dStart),
                                    EndDate: toUTC(dEnd),
                                    Quantity: oInputQty.getValue() || "0",
                                    UnitCode: bIsChild ? sUnitCode : "",
                                    Status: bEdit ? (oSelectStatus.getSelectedKey() || oContext.getProperty("Status")) : "PLANNING"
                                };

                                if (bEdit) {
                                    oPayload.WbsCode = sWbsCode;
                                }

                                var fnSaveLocation = function (sTargetWbsId, fnDone) {
                                    var sLName = oLocName.getValue().trim();
                                    if (!sLName) {
                                        fnDone(); // No location data entered
                                        return;
                                    }

                                    var formatDecimal = function (val) {
                                        var f = parseFloat(val);
                                        return isNaN(f) ? "0.00" : f.toFixed(2);
                                    };

                                    var oLocPayload = {
                                        WbsId: sTargetWbsId,
                                        LocationName: sLName,
                                        PosStart: formatDecimal(oLocStart.getValue()),
                                        PosEnd: formatDecimal(oLocEnd.getValue()),
                                        PosTop: formatDecimal(oLocTop.getValue()),
                                        PosBot: formatDecimal(oLocBot.getValue())
                                    };
                                    if (bEdit && sEditLocationId) {
                                        oModel.update("/LocationSet(guid'" + sEditLocationId + "')", oLocPayload, {
                                            success: function () { fnDone(); },
                                            error: function (oError) {
                                                that._showError(oError);
                                                fnDone(true);
                                            }
                                        });
                                    } else {
                                        oModel.create("/LocationSet", oLocPayload, {
                                            success: function () { fnDone(); },
                                            error: function (oError) {
                                                that._showError(oError);
                                                fnDone(true);
                                            }
                                        });
                                    }
                                };

                                if (bEdit) {
                                    var sEditWbsId = oContext.getProperty("WbsId");
                                    oModel.update("/WBSSet(guid'" + sEditWbsId + "')", oPayload, {
                                        success: function () {
                                            fnSaveLocation(sEditWbsId, function (bLocError) {
                                                if (!bLocError) {
                                                    MessageToast.show(oBundle.getText("wbsUpdated"));
                                                }
                                                oDialog.close();
                                                oModel.refresh(true);
                                                that._loadWbsData();
                                            });
                                        },
                                        error: function (oError) { that._showError(oError, "errorUpdatingWbs"); }
                                    });
                                } else {
                                    oPayload.SiteId = that._sCurrentSiteId;
                                    oPayload.ParentId = sParentId || null;
                                    oModel.create("/WBSSet", oPayload, {
                                        success: function (oData) {
                                            var sNewWbsId = oData.WbsId || (oData.d && oData.d.WbsId);
                                            if (sNewWbsId) {
                                                fnSaveLocation(sNewWbsId, function (bLocError) {
                                                    if (!bLocError) {
                                                        MessageToast.show(oBundle.getText("wbsCreatedSuccessfully"));
                                                    }
                                                    oDialog.close();
                                                    that._loadWbsData();
                                                });
                                            } else {
                                                MessageToast.show(oBundle.getText("wbsCreatedNoLocationLink"));
                                                oDialog.close();
                                                that._loadWbsData();
                                            }
                                        },
                                        error: function (oError) { that._showError(oError, "errorCreatingWbs"); }
                                    });
                                }
                            };

                            fnExecuteActualSave();
                        };

                        if (!oProjData.StartDate) {
                            var sProjId = that.getView().getBindingContext().getProperty("ProjectId");
                            if (sProjId) {
                                oModel.read("/ProjectSet(guid'" + sProjId + "')", {
                                    success: function (oFetched) { fnProceedSave(oFetched); },
                                    error: function () { fnProceedSave(oProjData); } // Skip silently if fails
                                });
                            } else {
                                fnProceedSave(oProjData);
                            }
                        } else {
                            fnProceedSave(oProjData);
                        }
                    }
                }),
                endButton: new Button({
                    text: oBundle.getText("cancel"),
                    press: function () { oDialog.close(); }
                }),
                afterClose: function () { oDialog.destroy(); }
            });

            oDialog.addStyleClass("sapUiContentPadding");
            oDialog.open();
        },

        _findWbsById: function (aNodes, sId) {
            if (!aNodes || !sId) return null;
            for (var i = 0; i < aNodes.length; i++) {
                if (aNodes[i].WbsId === sId) return aNodes[i];
                if (aNodes[i].children && aNodes[i].children.length > 0) {
                    var found = this._findWbsById(aNodes[i].children, sId);
                    if (found) return found;
                }
            }
            return null;
        },

        _transformToTree: function (aData) {
            var map = {}, node, res = [], i;
            for (i = 0; i < aData.length; i++) {
                map[aData[i].WbsId] = i;
                aData[i].children = [];
                aData[i].IsRoot = false;
            }
            for (i = 0; i < aData.length; i++) {
                node = aData[i];
                if (node.ParentId && map[node.ParentId] !== undefined) {
                    node.IsRoot = false;
                    aData[map[node.ParentId]].children.push(node);
                } else {
                    node.IsRoot = true;
                    res.push(node);
                }
            }
            // Assign Depth and Type based on position in tree
            var fnSetDepth = function (nodes, depth) {
                for (var j = 0; j < nodes.length; j++) {
                    nodes[j].Depth = depth;
                    if (depth === 0) {
                        // Root ("Ông") — bracket style
                        nodes[j].Type = "ROOT";
                        nodes[j].IsRoot = true;
                    } else if (depth === 1) {
                        // Parent ("Cha") — black parent bar
                        nodes[j].Type = "WBS";
                        nodes[j].IsRoot = true;
                    } else {
                        // Child ("Con") — plan + actual bars
                        nodes[j].Type = "PLAN";
                        nodes[j].IsRoot = false;
                    }
                    if (nodes[j].children && nodes[j].children.length > 0) {
                        fnSetDepth(nodes[j].children, depth + 1);
                    }
                }
            };
            fnSetDepth(res, 0);
            return res;
        },

        _getWbsDepth: function (sWbsId) {
            var aTree = this.getView().getModel("viewData").getProperty("/WBS") || [];
            var fnFind = function (nodes, depth) {
                for (var i = 0; i < nodes.length; i++) {
                    if (nodes[i].WbsId === sWbsId) return depth;
                    if (nodes[i].children && nodes[i].children.length > 0) {
                        var found = fnFind(nodes[i].children, depth + 1);
                        if (found !== -1) return found;
                    }
                }
                return -1;
            };
            return fnFind(aTree, 0);
        },

        isRootNode: function (v) { return this._oWBSDelegate.isRootNode(v); },
        isChildNode: function (v) { return this._oWBSDelegate.isChildNode(v); },
        calcMargin: function (s) { return this._oWBSDelegate.calcMargin(s); },
        calcWidth: function (s, e) { return this._oWBSDelegate.calcWidth(s, e); },

        formatDate: function (oDate) {
            if (!oDate) return "";
            var d = oDate;
            if (!(d instanceof Date)) {
                if (typeof d === "string" && d.indexOf("/Date(") === 0) {
                    d = new Date(parseInt(d.substring(6)));
                } else {
                    d = new Date(d);
                }
            }
            if (isNaN(d.getTime())) return "";
            return DateFormat.getInstance({ pattern: "dd/MM/yyyy" }).format(d);
        },

        _showError: function (oError, sDefaultI18nKey) {
            var oBundle = this.getView().getModel("i18n").getResourceBundle();
            var sMsg = sDefaultI18nKey ? oBundle.getText(sDefaultI18nKey) : "System error occurred.";

            try {
                if (oError && oError.responseText) {
                    var oErr = JSON.parse(oError.responseText);
                    if (oErr.error && oErr.error.message && oErr.error.message.value) {
                        sMsg = oErr.error.message.value;
                    } else if (oErr.error && oErr.error.innererror && oErr.error.innererror.errordetails && oErr.error.innererror.errordetails.length > 0) {
                        sMsg = oErr.error.innererror.errordetails[0].message;
                    }
                } else if (oError && oError.message) {
                    sMsg = oError.message;
                }
            } catch (e) {
                // Keep default message
            }

            MessageBox.error(sMsg);
        },

        formatWorkVolume: function (sQuantity, sUnitCode) {
            if (!sQuantity || sQuantity === "0" || sQuantity === "0.000") return "";
            var fQty = parseFloat(sQuantity);
            if (isNaN(fQty)) return "";
            var sFormattedQty = Math.round(fQty).toString();
            var sUnit = sUnitCode ? " " + sUnitCode : "";
            return sFormattedQty + sUnit;
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
                default: return "sap-icon://status-in-process";
            }
        },

        formatTotalQty: function (v) {
            if (!v) return "0";
            var f = parseFloat(v);
            return isNaN(f) ? "0" : Math.round(f).toString();
        },

        // ── PENDING APPROVAL - CLOSE (ACCEPTANCE REPORT) REMOVED AS REQUESTED ──


        onSubmitForApproval: function () {
            // This is handled in WBS Detail, for Site Detail it shouldn't be visible in Approval Mode.
        },

        _loadLocation: function (sWbsId) {
            var oModel = this.getOwnerComponent().getModel();
            var oLocationModel = this.getView().getModel("locationModel");
            oLocationModel.setData({});
            oModel.read("/LocationSet", {
                filters: [new sap.ui.model.Filter("WbsId", sap.ui.model.FilterOperator.EQ, sWbsId)],
                success: function (oData) {
                    if (oData.results && oData.results.length > 0) {
                        oLocationModel.setData(oData.results[0]);
                    }
                }
            });
        },

        _loadProjectInfo: function (sSiteId) {
            var oModel = this.getOwnerComponent().getModel();
            var oProjectModel = this.getView().getModel("projectModel");
            oProjectModel.setData({});
            if (!sSiteId) return;

            oModel.read("/SiteSet(guid'" + sSiteId + "')", {
                success: function (oSiteData) {
                    if (oSiteData && oSiteData.ProjectId) {
                        oModel.read("/ProjectSet(guid'" + oSiteData.ProjectId + "')", {
                            success: function (oProjectData) {
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

        onGanttTaskClick: function (oEvent) {
            var oContext = oEvent.getParameter("rowBindingContext");
            if (!oContext) return;

            this.getOwnerComponent().getRouter().navTo("WBSDetail", {
                site_id: oContext.getProperty("SiteId"),
                wbsId: oContext.getProperty("WbsId")
            });
        },

        onPressPendingWbs: function (oEvent) {
            var oContext = oEvent.getSource().getBindingContext("viewData");
            if (!oContext) return;

            var sSiteId = oContext.getProperty("SiteId");
            var sWbsId = oContext.getProperty("WbsId");

            if (!sSiteId) {
                sSiteId = this._sCurrentSiteId;
            }

            this.getOwnerComponent().getRouter().navTo("WBSDetail", {
                site_id: sSiteId,
                wbsId: sWbsId
            });
        }
    });

    Object.assign(SiteDetailController.prototype, {
        _loadWorkSummary: WorkSummaryDelegate._loadWorkSummary,
        formatTotalQty: WorkSummaryDelegate.formatTotalQty
    });

    return SiteDetailController;
});