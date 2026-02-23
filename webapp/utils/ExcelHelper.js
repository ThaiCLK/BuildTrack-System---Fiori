sap.ui.define([
    "sap/m/MessageToast"
], function (MessageToast) {
    "use strict";

    return {
        /**
         * Tạo và download Excel template cho Daily Log
         */
        downloadTemplate: function() {
            try {
                const XLSX = window.XLSX;
                if (!XLSX) {
                    MessageToast.show("Thư viện XLSX chưa được tải!");
                    return;
                }

                // Tạo workbook
                var wb = XLSX.utils.book_new();

                // ========== SHEET 1: DAILY LOG ==========
                var dailyLogData = [
                    ["NHẬT KÝ THI CÔNG - DAILY LOG"],
                    [],
                    ["Mã nhật ký", "Ngày báo cáo", "Mã WBS", "Tên hạng mục", "Thời tiết (Sáng)", "Thời tiết (Chiều)", "CBKT", "CN", "Mô tả công việc", "Note An toàn vệ sinh", "Ý kiến tư vấn giám sát", "Ý kiến nhà thầu"],
                    ["LOG001", "13/02/2026", "WBS01", "Cọc khoan nhồi T1", "Nắng", "Mát mẻ", "2", "15", "Thi công cọc khoan nhồi đại trà", "Đã kiểm tra an toàn khu vực", "Đồng ý tiến độ", "Đảm bảo tiến độ"],
                    ["LOG002", "14/02/2026", "WBS02", "Đổ bê tông lót móng", "Mưa", "Mưa", "1", "8", "Tạm dừng do mưa", "Che chắn vật liệu", "Cần theo dõi thời tiết", "Sẽ bù tiến độ"],
                    [],
                    ["LƯU Ý:"],
                    ["- Mã nhật ký: Mã định danh duy nhất cho mỗi nhật ký (ví dụ: LOG001, LOG002,...)"],
                    ["- Ngày báo cáo: Định dạng dd/mm/yyyy (ví dụ: 13/02/2026)"],
                    ["- Thời tiết: Chỉ nhập 1 trong 3 giá trị: Nắng, Mát mẻ, Mưa"],
                    ["- CBKT, CN: Nhập số nguyên"],
                    ["- Mã WBS: Phải khớp với danh sách WBS trong hệ thống"],
                    ["- Mã nhật ký phải khớp với Sheet Resources để liên kết tài nguyên"]
                ];

                var ws1 = XLSX.utils.aoa_to_sheet(dailyLogData);
                
                // Định dạng cột
                ws1['!cols'] = [
                    {wch: 12}, // Mã nhật ký
                    {wch: 12}, // Ngày
                    {wch: 10}, // Mã WBS
                    {wch: 25}, // Tên hạng mục
                    {wch: 15}, // Thời tiết sáng
                    {wch: 15}, // Thời tiết chiều
                    {wch: 8},  // CBKT
                    {wch: 8},  // CN
                    {wch: 40}, // Mô tả
                    {wch: 30}, // Note ATVS
                    {wch: 30}, // Ý kiến TVGS
                    {wch: 30}  // Ý kiến nhà thầu
                ];
                
                XLSX.utils.book_append_sheet(wb, ws1, "DailyLog");

                // ========== SHEET 2: RESOURCES (FLEXIBLE) ==========
                var resourceData = [
                    ["TÀI NGUYÊN SỬ DỤNG - RESOURCES"],
                    [],
                    ["Mã nhật ký", "Tên tài nguyên", "Đơn vị", "Số lượng"],
                    ["LOG001", "Máy xúc", "chiếc", "2"],
                    ["LOG001", "Cần cẩu", "chiếc", "1"],
                    ["LOG001", "Máy hàn", "cái", "2"],
                    ["LOG001", "Đầm dùi", "cái", "4"],
                    ["LOG001", "Ô tô", "xe", "5"],
                    ["LOG002", "Ô tô", "xe", "2"],
                    [],
                    ["LƯU Ý:"],
                    ["- Mã nhật ký: Phải khớp với Sheet DailyLog"],
                    ["- Tên tài nguyên: Tên thiết bị/máy móc (tự do nhập, không giới hạn loại)"],
                    ["- Đơn vị: chiếc, xe, cái, bộ, m3, tấn,... (tùy chỉnh)"],
                    ["- Số lượng: Nhập số (có thể có thập phân)"],
                    ["- Một mã nhật ký có thể có nhiều dòng tài nguyên"]
                ];

                var ws2 = XLSX.utils.aoa_to_sheet(resourceData);
                
                ws2['!cols'] = [
                    {wch: 12}, // Mã nhật ký
                    {wch: 25}, // Tên tài nguyên
                    {wch: 12}, // Đơn vị
                    {wch: 12}  // Số lượng
                ];
                
                XLSX.utils.book_append_sheet(wb, ws2, "Resources");

                // Download file
                XLSX.writeFile(wb, "DailyLog_Template.xlsx");
                MessageToast.show("Đã tải xuống template thành công!");
                
            } catch (error) {
                console.error("Error creating template:", error);
                MessageToast.show("Lỗi khi tạo template: " + error.message);
            }
        },

        /**
         * Parse Excel file và trả về dữ liệu
         * @param {File} file - Excel file
         * @returns {Promise} - Promise với dữ liệu parsed
         */
        parseExcelFile: function(file) {
            return new Promise(function(resolve, reject) {
                try {
                    const XLSX = window.XLSX;
                    if (!XLSX) {
                        reject(new Error("Thư viện XLSX chưa được tải!"));
                        return;
                    }

                    var reader = new FileReader();
                    
                    reader.onload = function(e) {
                        try {
                            var data = new Uint8Array(e.target.result);
                            var workbook = XLSX.read(data, {type: 'array', cellDates: true});
                            
                            // Đọc Sheet 1: DailyLog
                            var dailyLogSheet = workbook.Sheets[workbook.SheetNames[0]];
                            var dailyLogJson = XLSX.utils.sheet_to_json(dailyLogSheet, {
                                header: 1,
                                raw: false,
                                dateNF: 'dd/mm/yyyy'
                            });

                            // Đọc Sheet 2: Resources
                            var resourceSheet = workbook.Sheets[workbook.SheetNames[1]];
                            var resourceJson = XLSX.utils.sheet_to_json(resourceSheet, {
                                header: 1,
                                raw: false
                            });

                            resolve({
                                dailyLogs: dailyLogJson,
                                resources: resourceJson,
                                sheetNames: workbook.SheetNames
                            });
                        } catch (parseError) {
                            reject(parseError);
                        }
                    };
                    
                    reader.onerror = function(error) {
                        reject(error);
                    };
                    
                    reader.readAsArrayBuffer(file);
                    
                } catch (error) {
                    reject(error);
                }
            });
        },

        /**
         * Chuyển đổi dữ liệu Excel thành format của model
         * @param {Array} dailyLogRows - Dữ liệu từ sheet DailyLog
         * @param {Array} resourceRows - Dữ liệu từ sheet Resources
         * @returns {Array} - Mảng các object daily log
         */
        transformExcelData: function(dailyLogRows, resourceRows) {
            var results = [];
            
            // Map thời tiết
            var weatherMap = {
                "Nắng": 0,
                "Mát mẻ": 1,
                "Mát me": 1,
                "Mưa": 2
            };

            // Tạo map resources theo mã nhật ký
            var resourceMap = {};
            if (resourceRows && resourceRows.length > 3) {
                for (var i = 3; i < resourceRows.length; i++) {
                    var resRow = resourceRows[i];
                    if (!resRow || resRow.length === 0) continue;
                    
                    var logId = resRow[0] ? resRow[0].toString().trim() : "";
                    if (!logId || logId.indexOf("LƯU Ý") >= 0) continue;
                    
                    if (!resourceMap[logId]) {
                        resourceMap[logId] = [];
                    }
                    
                    resourceMap[logId].push({
                        resource_name: resRow[1] ? resRow[1].toString() : "",
                        unit: resRow[2] ? resRow[2].toString() : "",
                        quantity: parseFloat(resRow[3]) || 0
                    });
                }
            }

            // Parse Daily Log (bắt đầu từ dòng 3, dòng 0-2 là header)
            if (dailyLogRows && dailyLogRows.length > 3) {
                for (var i = 3; i < dailyLogRows.length; i++) {
                    var row = dailyLogRows[i];
                    
                    // Bỏ qua dòng trống hoặc dòng ghi chú
                    if (!row || row.length === 0 || !row[0] || row[0].toString().trim() === "") continue;
                    if (row[0].toString().indexOf("LƯU Ý") >= 0) break;

                    try {
                        var logId = row[0].toString().trim();
                        var dateStr = row[1].toString().trim();
                        var logDate = this._parseDate(dateStr);
                        
                        var wbsId = row[2] ? row[2].toString().trim() : "";
                        
                        // Lấy resources từ map
                        var resources = resourceMap[logId] || [];

                        var dailyLog = {
                            log_id: logId,
                            wbs_id: wbsId,
                            wbs_name: row[3] ? row[3].toString() : "",
                            log_date: logDate,
                            weather_am_idx: weatherMap[row[4]] !== undefined ? weatherMap[row[4]] : 0,
                            weather_pm_idx: weatherMap[row[5]] !== undefined ? weatherMap[row[5]] : 0,
                            man_cbkt: parseInt(row[6]) || 0,
                            man_cn: parseInt(row[7]) || 0,
                            description: row[8] ? row[8].toString() : "",
                            note_safety: row[9] ? row[9].toString() : "",
                            consultant_note: row[10] ? row[10].toString() : "",
                            contractor_note: row[11] ? row[11].toString() : "",
                            resources: resources, // Array of resources
                            location_name: "",
                            qty_done: 0,
                            unit: ""
                        };
                        
                        results.push(dailyLog);
                    } catch (e) {
                        console.error("Error parsing row " + i + ":", e, row);
                    }
                }
            }

            return results;
        },

        /**
         * Parse ngày từ string dd/mm/yyyy
         */
        _parseDate: function(dateStr) {
            if (!dateStr) return new Date();
            
            // Nếu đã là Date object
            if (dateStr instanceof Date) return dateStr;
            
            // Parse dd/mm/yyyy
            var parts = dateStr.split("/");
            if (parts.length === 3) {
                var day = parseInt(parts[0]);
                var month = parseInt(parts[1]) - 1; // Month is 0-indexed
                var year = parseInt(parts[2]);
                return new Date(year, month, day);
            }
            
            return new Date(dateStr);
        }
    };
});
