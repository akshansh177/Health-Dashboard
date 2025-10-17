ACS Health Dashboard

This is a web-based dashboard for managing patient health records, designed for clinics and health outreach programs. It provides features for patient registration, follow-ups, inventory management, and reporting.

Features

Dashboard: At-a-glance overview of total patients, monthly visits, and low-stock medicines.

Patient Records: Comprehensive system to add, view, edit, and delete patient information and their visit history.

Follow-ups: Detailed forms to track patient vitals, medical history, and prescriptions during follow-up visits.

Medicine Inventory: Manage medicine stock, track issued quantities, and monitor expiration dates.

Lab Records: Log and view lab test results for patients.

Reporting: Generate and export various reports, including:

Daily/Monthly Visitor Logs

Village-wise Health Summaries

Patient Demographics

Cumulative Annual Reports

Logbook: Maintain an ambulance or vehicle log for travel records.

Activity Log: Tracks all major actions performed within the application for auditing.

Tech Stack

Frontend: HTML, CSS, JavaScript, jQuery, Bootstrap

Backend: Node.js, Express.js

Database: MySQL

Setup and Installation

Clone the repository:

git clone <your-repository-url>
cd <repository-directory>


Install backend dependencies:

npm install


Set up the database:

Make sure you have a MySQL server running.

Create a new database.

Execute the database_schema.sql file provided in this project to create the necessary tables.

Configure environment variables:

Create a .env file in the root directory.

Add the following configuration details, replacing the placeholder values with your database credentials:

DB_HOST=localhost
DB_USER=your_mysql_user
DB_PASSWORD=your_mysql_password
DB_NAME=your_database_name
PORT=3000


Run the application:

Start the backend server:

node server.js


Open the index.html file in your web browser.

The application will be running with the backend server on http://localhost:3000.# akshansh-health-dashboard
