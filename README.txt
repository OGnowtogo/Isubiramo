ISUBIRAMO — REAL DATABASE + PDF UPLOAD 

WHAT IS INCLUDED
- public/: website HTML, CSS and JavaScript
- server.js: backend API, administrator login, PDF upload and download
- data/isubiramo.sqlite: created automatically; stores resource details
- uploads/: stores the actual uploaded PDF files
- Admin password is checked on the server, not in browser JavaScript.

WINDOWS INSTALLATION (FIRST TIME)
1. Install Node.js 20 LTS or newer from https://nodejs.org/ and restart PowerShell.
2. Extract this ZIP into a normal folder, for example:
   C:\Users\YOUR-WINDOWS-USER\Documents\ISUBIRAMO
3. Make a copy of .env.example and name the copy exactly .env (not .env.txt).
4. Open .env in Notepad. Replace ADMIN_PASSWORD with your private password (at least 12 characters). Replace SESSION_SECRET with a long random secret (at least 32 characters). Save it. Never share .env.
5. Open PowerShell in the ISUBIRAMO folder and run these commands one at a time:

   npm install
   npm start

6. Open http://localhost:3000 in your browser.
7. Click Admin and sign in using the password you put in .env.

UPLOADING RESOURCES
- Choose Book or Past paper, select the class, enter the title and subject, choose the PDF file from your computer, then click Add to library.
- Choose Video lesson to add a YouTube or Vimeo URL.
- PDF files are saved in uploads; resource details are saved in data/isubiramo.sqlite.

OPENING ON OTHER DEVICES ON THE SAME WI-FI
1. Keep the server running on the hosting computer.
2. Run ipconfig in PowerShell on that computer and find its local IPv4 address.
3. On another device on the same Wi-Fi, open http://HOST-COMPUTER-IP:3000.
4. If Windows Firewall asks, allow Node.js on your Private network. Do not expose port 3000 directly to the public internet.

BACKUPS
Back up BOTH the data folder and uploads folder regularly. They contain the catalogue and the actual PDFs. Copy both folders when moving to another computer. Data is stored on the server computer and is not automatically cloud-backed-up.

PUBLIC DEPLOYMENT
This is a self-hosted starter setup. Before public internet deployment, use HTTPS, a secure host, firewall rules, regular off-site backups and production session configuration. Do not expose the development setup directly to the public internet.

Developed by Elysee Dushime