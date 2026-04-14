sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/core/Fragment",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "sap/m/MessageBox"
], (BaseController, Fragment, JSONModel, MessageToast, MessageBox) => {
    "use strict";

    return BaseController.extend("z.bts.buildtrack551.controller.App", {
        onInit() {
            /*
            this.getView().setModel(new JSONModel({
                draft: "",
                isBusy: false,
                messages: [
                    this._createMessage(
                        "assistant",
                        "Xin chào, tôi là BuildTrack Assistant. Bạn có thể hỏi cách sử dụng màn hình Dashboard, Project, Site hoặc WBS.",
                        []
                    )
                ]
            }), "assistant");
            */

            // Bật công tắc lắng nghe chảo thu sóng vệ tinh WebSocket
            this._initWebSocket();
        },

        _initWebSocket: function () {
            // Do Fiori deploy trên BE SAP, ta sẽ lấy luôn cấu hình kết nối host/port hiện tại của người dùng
            var protocol = window.location.protocol === "https:" ? "wss://" : "ws://";
            var host = window.location.host;
            // Đường dẫn chính xác trỏ về cái SAPC mình vừa kích hoạt trên T-Code
            var wsUrl = protocol + host + "/sap/bc/apc/sap/zapc_buildtrack";

            try {
                if (this._ws) { return; } // Nếu cắm điện rồi thì thôi

                this._ws = new WebSocket(wsUrl);
                this._ws.onopen = function (e) {
                    console.log("🔥 [BuildTrack] Cắm thành công ống dẫn WebSocket tới SAPC!");
                };
                this._ws.onmessage = function (e) {
                    console.log("⚡ [BuildTrack] Có biến! Nhận tín hiệu thời gian thực từ SAMC:", e.data);

                    // Ra lệnh cho Model OData tự động cào ngầm lại dữ liệu mới nhất mà không xé rách giao diện
                    var oModel = this.getView().getModel();
                    if (oModel) {
                        oModel.refresh(true, true);
                    }

                    // Đồng thời giật còi cho tất cả các biểu đồ, màn hình con biết để vẽ lại UI
                    setTimeout(function () {
                        sap.ui.getCore().getEventBus().publish("Global", "RefreshData");
                    }, 3500);
                }.bind(this);

                this._ws.onerror = function (e) {
                    console.warn("⚠️ [BuildTrack] Lỗi nối WebSocket. Chú ý: Nếu bạn đang chạy 'npm run start-local' thì kết nối có thể xịt, nhưng khi ấn lênh deploy lên hẳn hệ thống SAP ABAP thì nó sẽ chạy 100%!");
                };
                this._ws.onclose = function (e) {
                    // Chức năng thông minh của dây: nếu giật mạnh đứt mạng, tự thò tay cắm 5s/lần
                    this._ws = null;
                    setTimeout(this._initWebSocket.bind(this), 5000);
                }.bind(this);
            } catch (e) {
                console.error(e);
            }
        },
        onGlobalRefresh: function () {
            sap.ui.getCore().getEventBus().publish("Global", "RefreshData");
            var oBundle = this.getOwnerComponent().getModel("i18n").getResourceBundle();
            MessageToast.show(oBundle.getText("refreshSuccess") || "Đã làm mới dữ liệu");
        },
        onNavToDashboard: function () {
            this.getOwnerComponent().getRouter().navTo("Dashboard");
        },
        /* --- OLD GEMINI ASSISTANT METHODS (COMMENTED OUT) ---
        _getAssistantModel: function () {
            return this.getView().getModel("assistant");
        },
        _createMessage: function (role, text, citations) {
            var now = new Date();
            return {
                role: role,
                sender: role === "user" ? "Bạn" : "BuildTrack Assistant",
                icon: role === "user" ? "sap-icon://customer" : "sap-icon://discussion-2",
                text: text,
                citations: citations || [],
                time: now.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })
            };
        },
        _appendMessage: function (role, text, citations) {
            var oModel = this._getAssistantModel();
            var aMessages = oModel.getProperty("/messages") || [];
            aMessages.push(this._createMessage(role, text, citations));
            oModel.setProperty("/messages", aMessages);
        },
        onOpenAssistant: function () {
            if (this._oAssistantDialog) {
                this._oAssistantDialog.open();
                return;
            }
  
            Fragment.load({
                // Do not pass a fixed id here to avoid global ID collisions in app-preview reload cycles.
                name: "z.bts.buildtrack551.view.fragments.AssistantDialog",
                controller: this
            })
                .then(function (oDialog) {
                    this._oAssistantDialog = oDialog;
                    this.getView().addDependent(oDialog);
                    oDialog.open();
                }.bind(this))
                .catch(function (error) {
                    MessageToast.show("Không mở được Assistant. Vui lòng kiểm tra cấu hình fragment.");
                    console.error("Assistant dialog load failed:", error);
                    this._oAssistantDialog = null;
                }.bind(this));
        },
        _buildChatHistory: function (aMessages) {
            return aMessages.slice(-8).map(function (oMessage) {
                return {
                    role: oMessage.role,
                    text: oMessage.text
                };
            });
        },
        _formatAssistantText: function (sAnswer, aCitations) {
            return sAnswer;
        },
        _sendAssistantQuestion: async function (sQuestion) {
            var oModel = this._getAssistantModel();
            var sText = (sQuestion || "").trim();
  
            if (!sText || oModel.getProperty("/isBusy")) {
                return;
            }
  
            var aCurrentMessages = oModel.getProperty("/messages") || [];
            oModel.setProperty("/isBusy", true);
            oModel.setProperty("/draft", "");
            this._appendMessage("user", sText, []);
  
            try {
                var response = await fetch("/rag/api/chat", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        question: sText,
                        history: this._buildChatHistory(aCurrentMessages)
                    })
                });
  
                var data = await response.json();
                if (!response.ok || !data.ok) {
                    throw new Error(data.error || "RAG server error");
                }
  
                this._appendMessage(
                    "assistant",
                    this._formatAssistantText(data.answer, data.citations),
                    data.citations || []
                );
            } catch (error) {
                var sErrorText = error && error.message ? error.message : "Không xác định";
                this._appendMessage(
                    "assistant",
                    "BuildTrack Assistant tạm thời lỗi. Chi tiết: " + sErrorText,
                    []
                );
                MessageToast.show(sErrorText);
            } finally {
                oModel.setProperty("/isBusy", false);
            }
        },
        onAssistantSend: function () {
            var oModel = this._getAssistantModel();
            this._sendAssistantQuestion(oModel.getProperty("/draft"));
        },
        onAssistantSuggestionPress: function (oEvent) {
            var sQuestion = oEvent.getSource().getText();
            this._sendAssistantQuestion(sQuestion);
        },
        onAssistantReindex: async function () {
            var oModel = this._getAssistantModel();
            if (oModel.getProperty("/isBusy")) {
                return;
            }
  
            oModel.setProperty("/isBusy", true);
            try {
                var response = await fetch("/rag/api/reindex", { method: "POST" });
                var data = await response.json();
  
                if (!response.ok || !data.ok) {
                    throw new Error(data.error || "Reindex failed");
                }
  
                MessageToast.show("Đã cập nhật tri thức BuildTrack");
            } catch (error) {
                MessageToast.show(error.message);
            } finally {
                oModel.setProperty("/isBusy", false);
            }
        },
        ------------------------------------------------------- */
        onPressProfile: function (oEvent) {
            var oButton = oEvent.getSource();
            if (this._oProfilePopover) {
                this._oProfilePopover.openBy(oButton);
                return;
            }

            Fragment.load({
                name: "z.bts.buildtrack551.view.fragments.ProfilePopover",
                controller: this
            }).then(function (oPopover) {
                this._oProfilePopover = oPopover;
                this.getView().addDependent(oPopover);
                oPopover.openBy(oButton);
            }.bind(this));
        },
        onCloseProfile: function () {
            if (this._oProfilePopover) {
                this._oProfilePopover.close();
            }
        },

        /* ========================================================= */
        /* Create User Role Methods                                  */
        /* ========================================================= */
        onOpenUserRoleDialog: function () {
            this._openUserRoleDialog("Create");
        },

        onOpenUserRoleUpdateDialog: function (oEvent, sForceUserId) {
            var sId = typeof sForceUserId === "string" ? sForceUserId :
                (typeof oEvent === "string" ? oEvent : null);

            var oUserModel = this.getView().getModel("userModel");
            if (!sId && oUserModel && oUserModel.getProperty("/authLevel") !== 99) {
                sId = oUserModel.getProperty("/userId");
            }

            this._openUserRoleDialog("Update", sId);
        },

        _openUserRoleDialog: function (sMode, sUserId) {
            var bHasInitialId = !!sUserId;
            // Initialize new User Role model
            var oNewUserModel = new sap.ui.model.json.JSONModel({
                UserId: sUserId || "",
                UserName: "",
                Email: "",
                AuthLevel: "99",
                AvatarUrl: "",
                SignatureUrl: "",
                LeadId: "",
                Status: "ACTIVE",
                mode: sMode,
                isSignatureRequired: false,
                isLeadIdRequired: false
            });
            this.getView().setModel(oNewUserModel, "newUser");

            if (this._oUserRoleDialog) {
                this._applyLeadIdFilter();
                this._oUserRoleDialog.open();
                if (bHasInitialId) {
                    this.onFetchUserRole();
                }
                return;
            }

            sap.ui.core.Fragment.load({
                name: "z.bts.buildtrack551.view.fragments.UserRoleDialog",
                controller: this
            }).then(function (oDialog) {
                this._oUserRoleDialog = oDialog;
                this.getView().addDependent(oDialog);
                this._applyLeadIdFilter();
                this._oUserRoleDialog.open();
                if (bHasInitialId) {
                    this.onFetchUserRole();
                }
            }.bind(this));
        },

        _applyLeadIdFilter: function () {
            var oComboBox = sap.ui.getCore().byId("cbLeadId");
            if (!oComboBox && this.getView()) {
                oComboBox = this.getView().byId("cbLeadId");
            }
            if (!oComboBox) return;

            // Fetch all users and filter client-side because backend ignores OData AuthLevel filters
            var oModel = this.getView().getModel();
            oModel.read("/UserRoleSet", {
                success: function (oData) {
                    var aUsers = oData.results || [];
                    var aLeads = aUsers.filter(function (u) {
                        // Loose comparison to allow string or int
                        return u.AuthLevel == 1 && (u.Status === "ACTIVE" || u.Status === "INACTIVE");
                    });
                    var oLeadModel = new sap.ui.model.json.JSONModel(aLeads);
                    this.getView().setModel(oLeadModel, "leadEngineersList");
                }.bind(this),
                error: function () {
                    this.getView().setModel(new sap.ui.model.json.JSONModel([]), "leadEngineersList");
                }.bind(this)
            });
        },

        onFetchUserRole: function () {
            var oNewUserModel = this.getView().getModel("newUser");
            var sUserId = oNewUserModel.getProperty("/UserId");
            var oBundle = this.getView().getModel("i18n").getResourceBundle();

            if (!sUserId) return;

            this.getView().setBusy(true);
            var oModel = this.getView().getModel();
            oModel.read("/UserRoleSet('" + sUserId + "')", {
                success: function (oData) {
                    this.getView().setBusy(false);
                    oNewUserModel.setProperty("/UserName", oData.UserName);
                    oNewUserModel.setProperty("/Email", oData.Email);
                    oNewUserModel.setProperty("/AuthLevel", String(oData.AuthLevel));
                    oNewUserModel.setProperty("/AvatarUrl", oData.AvatarUrl);
                    oNewUserModel.setProperty("/SignatureUrl", oData.SignatureUrl);
                    oNewUserModel.setProperty("/LeadId", oData.LeadId);
                    oNewUserModel.setProperty("/Status", oData.Status || "ACTIVE");

                    // Trigger requirement update
                    this.onAuthLevelChange({ getSource: function () { return { getSelectedKey: function () { return String(oData.AuthLevel); } }; } });
                }.bind(this),
                error: function () {
                    this.getView().setBusy(false);
                    sap.m.MessageBox.error(oBundle.getText("errorUserNotFound"));
                }.bind(this)
            });
        },

        onAuthLevelChange: function (oEvent) {
            var sKey = oEvent.getSource().getSelectedKey();
            var oNewUserModel = this.getView().getModel("newUser");

            var bSigRequired = (sKey === "1" || sKey === "2" || sKey === "3");
            var bLeadRequired = (sKey === "0");

            oNewUserModel.setProperty("/isSignatureRequired", bSigRequired);
            oNewUserModel.setProperty("/isLeadIdRequired", bLeadRequired);

            if (bLeadRequired) {
                // Ensure ComboBox is properly filtered when it becomes visible
                setTimeout(function () {
                    this._applyLeadIdFilter();
                }.bind(this), 100);
            }

            if (!bSigRequired) oNewUserModel.setProperty("/SignatureUrl", "");
            if (!bLeadRequired) oNewUserModel.setProperty("/LeadId", "");
        },

        onSaveUserRole: function () {
            var oNewUserModel = this.getView().getModel("newUser");
            var oData = oNewUserModel.getData();
            var oBundle = this.getView().getModel("i18n").getResourceBundle();

            // Frontend validation
            if (!oData.UserId || !oData.UserName || !oData.Email || !oData.AuthLevel) {
                sap.m.MessageBox.error(oBundle.getText("errorFillRequiredFields"));
                return;
            }
            if (oData.isSignatureRequired && !oData.SignatureUrl) {
                sap.m.MessageBox.error(oBundle.getText("errorFillSignatureUrl"));
                return;
            }
            if (oData.isLeadIdRequired && !oData.LeadId) {
                sap.m.MessageBox.error(oBundle.getText("errorFillLeadId"));
                return;
            }

            var oPayload = {
                UserId: oData.UserId,
                UserName: oData.UserName,
                Email: oData.Email,
                AuthLevel: parseInt(oData.AuthLevel, 10),
                AvatarUrl: oData.AvatarUrl,
                SignatureUrl: oData.SignatureUrl,
                LeadId: oData.LeadId,
                Status: oData.Status
            };

            this.getView().setBusy(true);
            var oModel = this.getView().getModel();

            if (oData.mode === "Update") {
                oModel.update("/UserRoleSet('" + oData.UserId + "')", oPayload, {
                    success: function () {
                        this.getView().setBusy(false);
                        sap.m.MessageToast.show(oBundle.getText("userRoleUpdatedSuccess"));
                        this._oUserRoleDialog.close();
                    }.bind(this),
                    error: function (oError) {
                        this.getView().setBusy(false);
                        this._handleError(oError, "userRoleUpdatedError");
                    }.bind(this)
                });
            } else {
                oModel.create("/UserRoleSet", oPayload, {
                    success: function () {
                        this.getView().setBusy(false);
                        sap.m.MessageToast.show(oBundle.getText("userRoleCreatedSuccess"));
                        this._oUserRoleDialog.close();
                    }.bind(this),
                    error: function (oError) {
                        this.getView().setBusy(false);
                        this._handleError(oError, "userRoleCreatedError");
                    }.bind(this)
                });
            }
        },

        _handleError: function (oError, sDefaultI18nKey) {
            var oBundle = this.getView().getModel("i18n").getResourceBundle();
            try {
                var sMsg = JSON.parse(oError.responseText).error.message.value;
                sap.m.MessageBox.error(sMsg);
            } catch (e) {
                sap.m.MessageBox.error(oBundle.getText(sDefaultI18nKey));
            }
        },

        onCancelUserRole: function () {
            if (this._oUserRoleDialog) {
                this._oUserRoleDialog.close();
            }
        },
        /*
        onCloseAssistant: function () {
            if (this._oAssistantDialog) {
                this._oAssistantDialog.close();
            }
        },
        */
        onExit: function () {
            /*
            if (this._oAssistantDialog) {
                this._oAssistantDialog.destroy();
                this._oAssistantDialog = null;
            }
            */
            if (this._oProfilePopover) {
                this._oProfilePopover.destroy();
                this._oProfilePopover = null;
            }
        },

        onLanguageSelect: function (oEvent) {
            var sKey = oEvent.getParameter("item").getKey();
            var oConfiguration = sap.ui.getCore().getConfiguration();

            if (oConfiguration.getLanguage() !== sKey) {
                oConfiguration.setLanguage(sKey);
                localStorage.setItem("buildtrack_lang", sKey);
                var oBundle = this.getView().getModel("i18n").getResourceBundle();
                var sMsg = oBundle.getText("languageChanged", [sKey === "vi" ? oBundle.getText("vietnamese") : oBundle.getText("english")]);
                sap.m.MessageToast.show(sMsg);
            }
        },

        formatUserRole: function (iAuthLevel) {
            var oBundle = (this.getOwnerComponent() ? this.getOwnerComponent().getModel("i18n") : this.getView().getModel("i18n")).getResourceBundle();
            var level = parseInt(iAuthLevel, 10);
            switch (level) {
                case 0: return oBundle.getText("roleFieldEngineer");
                case 1: return oBundle.getText("roleLeadEngineer");
                case 2: return oBundle.getText("roleSupervisor");
                case 3: return oBundle.getText("roleInvestor");
                case 99: return oBundle.getText("roleSystemAdmin");
                default: return oBundle.getText("unknown");
            }
        }
    });
});