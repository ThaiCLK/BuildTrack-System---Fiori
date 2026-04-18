    # Luong Hoat Dong Chuc Nang Chatbot (BuildTrack Assistant)

    ## 1. Muc tieu
    Chuc nang chatbot duoc thiet ke de huong dan nguoi dung su dung BuildTrack thong qua:
    - Giao dien chat trong SAPUI5.
    - RAG backend (Python + Gemini).
    - Truy xuat tri thuc tu tai lieu va source du an.

    ## 2. Kien truc tong quan
    - Frontend: SAPUI5 (`App.controller.js` + fragment dialog).
    - Backend: FastAPI server (`rag-server-py/app.py`).
    - Knowledge layer: Index va retrieval (`rag-server-py/index_builder.py`, `rag-server-py/knowledge_base.py`).
    - LLM layer: Gemini API client (`rag-server-py/gemini_client.py`).

    ## 3. Luong nghiep vu tu dau den cuoi

    ### Buoc 1: Nguoi dung mo Assistant
    1. Nguoi dung bam nut Assistant tren header.
    2. Frontend goi `onOpenAssistant`.
    3. Fragment dialog duoc lazy-load (neu chua co) va mo ra.
    4. JSONModel `assistant` quan ly state:
    - `draft`: noi dung nguoi dung dang nhap.
    - `isBusy`: trang thai dang xu ly.
    - `messages`: lich su hoi dap.

    ### Buoc 2: Nguoi dung gui cau hoi
    1. Nguoi dung nhan Enter hoac nut Gui.
    2. Frontend goi `onAssistantSend` -> `_sendAssistantQuestion`.
    3. Frontend:
    - Kiem tra cau hoi khong rong.
    - Khoa giao dien bang `isBusy=true`.
    - Append tin nhan cua nguoi dung vao `messages`.

    ### Buoc 3: Frontend goi API chat
    1. Frontend `fetch` den `POST /rag/api/chat`.
    2. Payload:
    - `question`: cau hoi hien tai.
    - `history`: mot phan lich su gan nhat (de giu context hoi thoai).

    ### Buoc 4: Backend xu ly chat
    1. Server nhan request tai `app.py`.
    2. Goi `answer_question` trong `knowledge_base.py`.
    3. `answer_question` thuc hien:
    - Dam bao knowledge index da co (`loadKnowledge`).
    - Lay context lien quan nhat (retrieval).
    - Tao prompt theo quy tac BuildTrack Assistant.
    - Goi `generateAnswer` de sinh cau tra loi.

    ### Buoc 5: Retrieval (RAG)
    He thong dang uu tien toc do va do on dinh:
    1. Index gom cac chunk tu docs + source duoc chi dinh.
    2. Mac dinh dung keyword retrieval de tranh quota embedding.
    3. Neu bat embedding thi dung vector + keyword ket hop.
    4. Lay top-k context phu hop de dua vao prompt.

    ### Buoc 6: Sinh cau tra loi
    1. `gemini_client.generate_answer` thu cac model theo fallback list.
    2. Model hop le dau tien se duoc dung de generate.
    3. Neu mot model khong ho tro hoac loi quota, he thong thu model tiep theo.

    ### Buoc 7: Tra ket qua ve UI
    1. Backend tra `ok: true` + `answer`.
    2. Frontend append tin nhan Assistant vao danh sach.
    3. Bo khoa UI (`isBusy=false`).

    ## 4. Luong khoi dong va tri thuc

    ### Khoi dong RAG server
    1. Server bind cong truoc de UI co the ket noi ngay.
    2. Khoi tao knowledge index chay nen.
    3. Health endpoint:
    - `initializing`: dang tao/nap index.
    - `ready`: san sang chat.
    - `error`: loi khoi tao tri thuc.

    ### Tai tao index
    1. Co the rebuild bang script `npm run rag:index`.
    2. File index luu tai `rag-server-py/storage/knowledge-index.json`.

    ## 5. Cac nhanh loi va cach xu ly

    ### Loi quota Gemini (429)
    - Nguyen nhan: vuot gioi han free-tier.
    - Giai phap hien tai: dung keyword retrieval mac dinh, fallback model khi generate.

    ### Loi model khong ho tro (404)
    - Nguyen nhan: model name khong ton tai/khong ho tro cho account.
    - Giai phap: fallback danh sach model hop le trong `gemini_client.py`.

    ### Loi ket noi backend
    - Frontend hien thong bao loi trong khung chat va MessageToast.
    - Kiem tra nhanh qua `GET /rag/api/health`.

    ## 6. Tinh nang giao dien lien quan
    - Goi y cau hoi nhanh (3 nut goi y).
    - Lich su hoi dap trong cung mot session view.
    - Trang thai busy de tranh gui trung request.
    - Dong profile va assistant theo singleton dialog/popover pattern.

    ## 7. Tom tat logic
    1. User interaction (UI) -> 2) API call -> 3) Retrieval context -> 4) LLM generate -> 5) Return answer -> 6) Render message.

    Muc tieu cua luong nay la:
    - Nhanh: uu tien phan hoi som.
    - On dinh: khong de quota embedding lam dung he thong.
    - De bao tri: tach ro UI, API, retrieval, va model client.
