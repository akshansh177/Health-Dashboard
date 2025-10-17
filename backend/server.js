require('dotenv').config();
const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const excel = require('exceljs');

const app = express();
const port = process.env.PORT || 3000;

// --- CORS ---
app.use(cors({
    origin: 'https://health.akshanshconsultancy.com',
    methods: ['GET','POST','PUT','DELETE'],
    credentials: true
}));


const db = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
}).promise();

// A helper function to log activities
const logActivity = async (action, details = '') => {
    try {
        const log = { action, details };
        await db.query('INSERT INTO activity_log SET ?', log);
    } catch (err) {
        console.error('Failed to log activity:', err);
    }
};

const parseMedicineString = (medString) => {
    if (!medString || medString.trim() === '') {
        return [];
    }
    // Handles formats like "MedName (10), Another Med (20)"
    const medicines = medString.split(',').map(m => m.trim());
    const parsed = [];
    // Regex to capture med name (non-greedy) and quantity in parentheses
    const regex = /(.+?)\s*\((\d+)\)/;

    for (const med of medicines) {
        const match = med.match(regex);
        if (match && match[1] && match[2]) {
            parsed.push({
                name: match[1].trim(),
                quantity: parseInt(match[2], 10)
            });
        }
    }
    return parsed;
};


// --- DASHBOARD STATS ---
app.get('/api/dashboard-stats', async (req, res) => {
    try {
        const [patientCount] = await db.query('SELECT COUNT(id) as count FROM patients');

        const date = new Date();
        const firstDay = new Date(date.getFullYear(), date.getMonth(), 1).toISOString().slice(0, 10);

        const [initialVisits] = await db.query('SELECT COUNT(id) as count FROM patients WHERE registration_date >= ?', [firstDay]);
        const [followUpVisits] = await db.query('SELECT COUNT(id) as count FROM follow_ups WHERE follow_up_date >= ?', [firstDay]);

        const [lowStockCount] = await db.query('SELECT COUNT(id) as count FROM medicine_inventory WHERE stock_count - issued_quantity <= 10');

        res.json({
            totalPatients: patientCount[0].count,
            visitsThisMonth: initialVisits[0].count + followUpVisits[0].count,
            lowStockItems: lowStockCount[0].count
        });
    } catch (err) {
        console.error(err);
        res.status(500).send("Server Error");
    }
});


// --- PATIENT ENDPOINTS ---
app.post('/api/patients', async (req, res) => {
    const { name, husband_father_name, age, sex, village_name, program_type, caste, registration_date, bpl_status, anc_details, pnc_details } = req.body;
    
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        let [villages] = await connection.query('SELECT id FROM villages WHERE name = ?', [village_name]);
        let village_id;
        if (villages.length > 0) {
            village_id = villages[0].id;
        } else {
            const [result] = await connection.query('INSERT INTO villages (name) VALUES (?)', [village_name]);
            village_id = result.insertId;
        }
        
        const patient = { name, husband_father_name, age, sex, village_id, program_type, caste, registration_date, bpl_status };
        const [result] = await connection.query('INSERT INTO patients SET ?', patient);
        const patientId = result.insertId;

        if (program_type === 'ANC' && anc_details) {
            const ancData = { patient_id: patientId, ...anc_details };
            await connection.query('INSERT INTO anc_details SET ?', ancData);
        } else if (program_type === 'PNC' && pnc_details) {
            const pncData = { patient_id: patientId, ...pnc_details };
            await connection.query('INSERT INTO pnc_details SET ?', pncData);
        }

        await connection.commit();
        
        await logActivity('Patient Created', `New patient registered: ${name} (ID: ${patientId})`);
        res.status(201).json({ id: patientId, name: name });

    } catch (err) {
        await connection.rollback();
        console.error(err);
        res.status(500).send("Server error");
    } finally {
        connection.release();
    }
});

app.get('/api/patients/list', async (req, res) => {
    try {
        const [patients] = await db.query('SELECT id, name FROM patients ORDER BY name ASC');
        res.json(patients);
    } catch (err) { console.error(err); res.status(500).send("Server error"); }
});

app.get('/api/patient-details/:id', async (req, res) => {
    try {
        const patientId = req.params.id;

        const patientSql = `
            SELECT p.*, v.name as village_name, DATE_FORMAT(p.registration_date, '%Y-%m-%d') as registration_date
            FROM patients p
            LEFT JOIN villages v ON p.village_id = v.id
            WHERE p.id = ?`;
        const [patientRows] = await db.query(patientSql, [patientId]);

        if (patientRows.length === 0) {
            return res.status(404).send('Patient not found');
        }
        const patientDetails = patientRows[0];

        const followUpSql = `SELECT *, DATE_FORMAT(follow_up_date, '%Y-%m-%d') as follow_up_date FROM follow_ups WHERE patient_id = ? ORDER BY follow_up_date DESC`;
        const [followUps] = await db.query(followUpSql, [patientId]);

        let ancDetails = null;
        if (patientDetails.program_type === 'ANC') {
            const [ancRows] = await db.query('SELECT * FROM anc_details WHERE patient_id = ?', [patientId]);
            if (ancRows.length > 0) ancDetails = ancRows[0];
        }
        
        let pncDetails = null;
        if (patientDetails.program_type === 'PNC') {
            const [pncRows] = await db.query('SELECT * FROM pnc_details WHERE patient_id = ?', [patientId]);
            if (pncRows.length > 0) pncDetails = pncRows[0];
        }

        res.json({
            details: patientDetails,
            follow_ups: followUps,
            anc_details: ancDetails,
            pnc_details: pncDetails
        });

    } catch (err) {
        console.error(err);
        res.status(500).send("Server error");
    }
});

app.put('/api/patients/:id', async (req, res) => {
    const patientId = req.params.id;
    const { name, husband_father_name, age, sex, village_name, program_type, caste, registration_date, bpl_status, anc_details, pnc_details } = req.body;
    
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        let [villages] = await connection.query('SELECT id FROM villages WHERE name = ?', [village_name]);
        let village_id;
        if (villages.length > 0) {
            village_id = villages[0].id;
        } else {
            const [result] = await connection.query('INSERT INTO villages (name) VALUES (?)', [village_name]);
            village_id = result.insertId;
        }

        const patientData = { name, husband_father_name, age, sex, village_id, program_type, caste, registration_date, bpl_status };
        await connection.query('UPDATE patients SET ? WHERE id = ?', [patientData, patientId]);

        // Handle ANC/PNC details update
        await connection.query('DELETE FROM anc_details WHERE patient_id = ?', [patientId]);
        await connection.query('DELETE FROM pnc_details WHERE patient_id = ?', [patientId]);

        if (program_type === 'ANC' && anc_details) {
            const ancData = { patient_id: patientId, ...anc_details };
            await connection.query('INSERT INTO anc_details SET ?', ancData);
        } else if (program_type === 'PNC' && pnc_details) {
            const pncData = { patient_id: patientId, ...pnc_details };
            await connection.query('INSERT INTO pnc_details SET ?', pncData);
        }

        await connection.commit();
        await logActivity('Patient Updated', `Patient details updated for ${name} (ID: ${patientId})`);
        res.sendStatus(200);

    } catch (err) {
        await connection.rollback();
        console.error(err);
        res.status(500).send("Server error");
    } finally {
        connection.release();
    }
});

app.delete('/api/patients/:id', async (req, res) => {
    const patientId = req.params.id;
    try {
        const [patient] = await db.query('SELECT name FROM patients WHERE id = ?', [patientId]);
        const patientName = patient.length > 0 ? patient[0].name : `ID: ${patientId}`;
        
        await db.query('DELETE FROM patients WHERE id = ?', [patientId]);
        
        await logActivity('Patient Deleted', `Patient record deleted: ${patientName}`);
        res.sendStatus(204); // No Content
    } catch (err) {
        console.error(err);
        res.status(500).send("Server error");
    }
});

// --- FOLLOW-UP ENDPOINTS ---
app.post('/api/followups', async (req, res) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const [result] = await connection.query('INSERT INTO follow_ups SET ?', req.body);
        const followUpId = result.insertId;

        const prescribedMedsString = req.body.medicine_prescribed;
        if (prescribedMedsString) {
            const medicinesToIssue = parseMedicineString(prescribedMedsString);

            for (const med of medicinesToIssue) {
                const [medRows] = await connection.query('SELECT id, stock_count, issued_quantity FROM medicine_inventory WHERE name = ? FOR UPDATE', [med.name]);
                if (medRows.length === 0) {
                    throw new Error(`Medicine "${med.name}" not found in inventory.`);
                }
                const inventoryMed = medRows[0];
                const remainingStock = inventoryMed.stock_count - (inventoryMed.issued_quantity || 0);

                if (med.quantity > remainingStock) {
                    throw new Error(`Not enough stock for "${med.name}". Requested: ${med.quantity}, Remaining: ${remainingStock}`);
                }

                await connection.query('UPDATE medicine_inventory SET issued_quantity = COALESCE(issued_quantity, 0) + ? WHERE id = ?', [med.quantity, inventoryMed.id]);
            }
        }

        await connection.commit();

        const [patient] = await db.query('SELECT name FROM patients WHERE id = ?', [req.body.patient_id]);
        const patientName = patient.length > 0 ? patient[0].name : `ID: ${req.body.patient_id}`;
        await logActivity('Follow-up Added', `New follow-up added for patient: ${patientName} on date ${req.body.follow_up_date}`);
        res.status(201).json({id: followUpId});

    } catch (e) {
        await connection.rollback();
        console.error(e);
        res.status(500).send(e.message);
    } finally {
        connection.release();
    }
});

app.get('/api/followups/:id', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT *, DATE_FORMAT(follow_up_date, "%Y-%m-%d") as follow_up_date, DATE_FORMAT(last_menstrual_period, "%Y-%m-%d") as last_menstrual_period, DATE_FORMAT(expected_delivery_date, "%Y-%m-%d") as expected_delivery_date FROM follow_ups WHERE id = ?', [req.params.id]);
        if (rows.length > 0) {
            res.json(rows[0]);
        } else {
            res.status(404).send('Follow-up not found');
        }
    } catch (err) {
        console.error(err);
        res.status(500).send("Server Error");
    }
});

app.put('/api/followups/:id', async (req, res) => {
    const followUpId = req.params.id;
    const newFollowUpData = req.body;
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        const [oldFollowUpRows] = await connection.query('SELECT medicine_prescribed FROM follow_ups WHERE id = ?', [followUpId]);
        if (oldFollowUpRows.length === 0) {
            throw new Error('Follow-up record not found.');
        }
        const oldMedString = oldFollowUpRows[0].medicine_prescribed;

        await connection.query('UPDATE follow_ups SET ? WHERE id = ?', [newFollowUpData, followUpId]);

        const oldMeds = parseMedicineString(oldMedString);
        const newMeds = parseMedicineString(newFollowUpData.medicine_prescribed);
        const medDelta = {};

        oldMeds.forEach(med => {
            medDelta[med.name] = (medDelta[med.name] || 0) - med.quantity;
        });

        newMeds.forEach(med => {
            medDelta[med.name] = (medDelta[med.name] || 0) + med.quantity;
        });

        for (const medName in medDelta) {
            const delta = medDelta[medName];
            if (delta === 0) continue;

            const [medRows] = await connection.query('SELECT id, stock_count, issued_quantity FROM medicine_inventory WHERE name = ? FOR UPDATE', [medName]);
            if (medRows.length === 0) {
                throw new Error(`Medicine "${medName}" not found in inventory.`);
            }

            const inventoryMed = medRows[0];
            const remainingStock = inventoryMed.stock_count - (inventoryMed.issued_quantity || 0);

            if (delta > 0 && delta > remainingStock) {
                 throw new Error(`Not enough stock for "${medName}". Requested change: +${delta}, Remaining: ${remainingStock}`);
            }

            await connection.query('UPDATE medicine_inventory SET issued_quantity = COALESCE(issued_quantity, 0) + ? WHERE id = ?', [delta, inventoryMed.id]);
        }

        await connection.commit();

        const [followup] = await db.query('SELECT patient_id FROM follow_ups WHERE id = ?', [followUpId]);
        const [patient] = await db.query('SELECT name FROM patients WHERE id = ?', [followup[0].patient_id]);
        await logActivity('Follow-up Updated', `Follow-up record (ID: ${followUpId}) updated for patient: ${patient[0].name}`);

        res.sendStatus(200);

    } catch (err) {
        await connection.rollback();
        console.error(err);
        res.status(500).send(err.message);
    } finally {
        connection.release();
    }
});

// --- MEDICINE ENDPOINTS ---
app.get('/api/medicines', async (req, res) => { try { const [m] = await db.query('SELECT id, name, stock_count, COALESCE(issued_quantity, 0) as issued_quantity, DATE_FORMAT(expiration_date, "%Y-%m-%d") as expiration_date FROM medicine_inventory ORDER BY name ASC'); res.json(m); } catch (e) { console.error(e); res.status(500).send(); } });
app.post('/api/medicines', async (req, res) => {
    try {
        const newMedicine = { ...req.body, issued_quantity: 0 };
        const [result] = await db.query('INSERT INTO medicine_inventory SET ?', newMedicine);
        await logActivity('Medicine Added', `Added new medicine to inventory: ${req.body.name}`);
        res.status(201).json({id: result.insertId});
    } catch (e) {
        console.error(e);
        res.status(500).send();
    }
});
app.post('/api/medicines/issue/:id', async (req, res) => {
    try {
        const { quantity } = req.body;
        const medicineId = req.params.id;

        if (!quantity || isNaN(quantity) || quantity <= 0) {
            return res.status(400).send('Invalid quantity provided.');
        }

        const [rows] = await db.query('SELECT stock_count, COALESCE(issued_quantity, 0) as issued_quantity FROM medicine_inventory WHERE id = ?', [medicineId]);
        if (rows.length === 0) {
            return res.status(404).send('Medicine not found.');
        }

        const med = rows[0];
        const remaining = med.stock_count - med.issued_quantity;

        if (parseFloat(quantity) > remaining) {
            return res.status(400).send(`Issue quantity (${quantity}) exceeds remaining stock (${remaining}).`);
        }

        await db.query('UPDATE medicine_inventory SET issued_quantity = issued_quantity + ? WHERE id = ?', [parseFloat(quantity), medicineId]);
        
        await logActivity('Medicine Issued', `Issued ${quantity} of medicine ID: ${medicineId}`);
        res.sendStatus(200);
    } catch (err) {
        console.error(err);
        res.status(500).send("Server Error");
    }
});
app.put('/api/medicines/:id', async (req, res) => {
    try {
        await db.query('UPDATE medicine_inventory SET stock_count = ? WHERE id = ?', [req.body.stock_count, req.params.id]);
        await logActivity('Stock Updated', `Stock updated for medicine ID: ${req.params.id} to ${req.body.stock_count}`);
        res.sendStatus(200);
    } catch (e) {
        console.error(e);
        res.status(500).send();
    }
});
app.delete('/api/medicines/:id', async (req, res) => {
    try {
        await db.query('DELETE FROM medicine_inventory WHERE id = ?', [req.params.id]);
        await logActivity('Medicine Deleted', `Deleted medicine from inventory. ID: ${req.params.id}`);
        res.sendStatus(204);
    } catch (e) {
        console.error(e);
        res.status(500).send();
    }
});

// --- LAB & LOGBOOK ENDPOINTS ---
app.post('/api/lab-records', async (req, res) => {
    try {
        const [result] = await db.query('INSERT INTO lab_tests SET ?', req.body);
        const [patient] = await db.query('SELECT name FROM patients WHERE id = ?', [req.body.patient_id]);
        await logActivity('Lab Record Added', `New lab record for ${patient[0].name} (Test: ${req.body.test_name})`);
        res.status(201).json({ id: result.insertId });
    } catch (err) {
        console.error(err);
        res.status(500).send();
    }
});

// GET /api/lab-records with filtering
app.get('/api/lab-records', async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        let sql = `SELECT lt.*, p.name as patient_name, p.husband_father_name, p.sex, DATE_FORMAT(lt.test_date, '%Y-%m-%d') as test_date FROM lab_tests lt JOIN patients p ON lt.patient_id = p.id`;
        const params = [];
        let whereClauses = [];

        if (startDate) {
            whereClauses.push(`lt.test_date >= ?`);
            params.push(startDate);
        }
        if (endDate) {
            whereClauses.push(`lt.test_date <= ?`);
            params.push(endDate);
        }

        if(whereClauses.length > 0){
            sql += ` WHERE ${whereClauses.join(' AND ')}`;
        }

        sql += ` ORDER BY lt.test_date DESC, p.name ASC`;
        const [r] = await db.query(sql, params);
        res.json(r);
    } catch (err) {
        console.error(err);
        res.status(500).send();
    }
});

// Get a single lab record by ID
app.get('/api/lab-records/:id', async (req, res) => {
    try {
        const [rows] = await db.query("SELECT *, DATE_FORMAT(test_date, '%Y-%m-%d') as test_date FROM lab_tests WHERE id = ?", [req.params.id]);
        if (rows.length > 0) {
            res.json(rows[0]);
        } else {
            res.status(404).send('Lab record not found');
        }
    } catch (err) {
        console.error(err);
        res.status(500).send("Server Error");
    }
});

// Update a lab record
app.put('/api/lab-records/:id', async (req, res) => {
    try {
        const labRecordId = req.params.id;
        const { test_date, test_name, result_positive_reading, result_negative_reading } = req.body;
        const recordData = { test_date, test_name, result_positive_reading, result_negative_reading };
        
        await db.query('UPDATE lab_tests SET ? WHERE id = ?', [recordData, labRecordId]);
        await logActivity('Lab Record Updated', `Lab record (ID: ${labRecordId}) was updated.`);
        res.sendStatus(200);
    } catch (err) {
        console.error(err);
        res.status(500).send("Server Error");
    }
});

// Delete a lab record
app.delete('/api/lab-records/:id', async (req, res) => {
    try {
        const labRecordId = req.params.id;
        await db.query('DELETE FROM lab_tests WHERE id = ?', [labRecordId]);
        await logActivity('Lab Record Deleted', `Lab record (ID: ${labRecordId}) was deleted.`);
        res.sendStatus(204); // No Content
    } catch (err) {
        console.error(err);
        res.status(500).send("Server Error");
    }
});

// Lab Count Report Endpoint
app.get('/api/lab-report-count', async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        let sql = `
            SELECT
                test_name,
                COUNT(id) AS total_tests,
                SUM(CASE WHEN result_positive_reading IS NOT NULL AND result_positive_reading != '' THEN 1 ELSE 0 END) AS positive_count,
                SUM(CASE WHEN result_negative_reading IS NOT NULL AND result_negative_reading != '' THEN 1 ELSE 0 END) AS negative_count
            FROM lab_tests
        `;
        const params = [];

        if (startDate && endDate) {
            sql += ` WHERE test_date BETWEEN ? AND ?`;
            params.push(startDate, endDate);
        }

        sql += ` GROUP BY test_name ORDER BY test_name ASC`;
        const [results] = await db.query(sql, params);

        const finalResults = results.map(row => ({
            test_name: row.test_name,
            total_tests: row.total_tests,
            positive: row.positive_count,
            negative: row.negative_count,
            abnormal: row.positive_count,
            normal: row.negative_count
        }));
        
        res.json(finalResults);
    } catch (err) {
        console.error(err);
        res.status(500).send("Server Error");
    }
});

// Export Lab Count Report Endpoint
app.get('/api/lab-report-count/export', async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        let sql = `
            SELECT
                test_name,
                COUNT(id) AS total_tests,
                SUM(CASE WHEN result_positive_reading IS NOT NULL AND result_positive_reading != '' THEN 1 ELSE 0 END) AS positive_count,
                SUM(CASE WHEN result_negative_reading IS NOT NULL AND result_negative_reading != '' THEN 1 ELSE 0 END) AS negative_count
            FROM lab_tests
        `;
        const params = [];

        if (startDate && endDate) {
            sql += ` WHERE test_date BETWEEN ? AND ?`;
            params.push(startDate, endDate);
        }

        sql += ` GROUP BY test_name ORDER BY test_name ASC`;
        const [results] = await db.query(sql, params);

        const finalResults = results.map(row => ({
            test_name: row.test_name,
            total_tests: row.total_tests,
            positive: row.positive_count,
            negative: row.negative_count,
            abnormal: row.positive_count,
            normal: row.negative_count
        }));
        
        const workbook = new excel.Workbook();
        const worksheet = workbook.addWorksheet('Lab Test Counts');

        worksheet.columns = [
            { header: 'Test Name', key: 'test_name', width: 30 },
            { header: 'Total Tests', key: 'total_tests', width: 15 },
            { header: 'Positive', key: 'positive', width: 15 },
            { header: 'Negative', key: 'negative', width: 15 },
            { header: 'Abnormal', key: 'abnormal', width: 15 },
            { header: 'Normal', key: 'normal', width: 15 },
        ];

        worksheet.addRows(finalResults);

        res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition','attachment; filename=lab_test_count_report.xlsx');
        await workbook.xlsx.write(res);
        res.end();

    } catch (err) {
        console.error(err);
        res.status(500).send("Server Error");
    }
});


app.post('/api/logbook', async (req, res) => {
    try {
        const [result] = await db.query('INSERT INTO logbook SET ?', req.body);
        await logActivity('Logbook Entry Added', `New ambulance logbook entry for date: ${req.body.entry_date}`);
        res.status(201).json({ id: result.insertId });
    } catch (err) {
        console.error(err);
        res.status(500).send();
    }
});
app.get('/api/logbook', async (req, res) => { try { const [e] = await db.query(`SELECT *, DATE_FORMAT(entry_date, '%Y-%m-%d') as entry_date FROM logbook ORDER BY entry_date DESC`); res.json(e); } catch (err) { console.error(err); res.status(500).send(); }});

// --- ACTIVITY LOG ENDPOINT ---
app.get('/api/activity-log', async (req, res) => {
    try {
        const [logs] = await db.query("SELECT id, action, details, DATE_FORMAT(timestamp, '%Y-%m-%d %H:%i:%s') as timestamp FROM activity_log ORDER BY timestamp DESC");
        res.json(logs);
    } catch (err) {
        console.error(err);
        res.status(500).send("Server Error");
    }
});


// --- REPORTING LOGIC & DATA FETCHERS ---
const getPatientRecords = async (filters = {}) => {
    const { searchTerm, startDate, endDate } = filters;
    
    let sql = `
        SELECT
            p.id, p.name, v.name as village_name,
            DATE_FORMAT(p.registration_date, '%Y-%m-%d') as registration_date,
            (SELECT MAX(DATE_FORMAT(f.follow_up_date, '%Y-%m-%d')) FROM follow_ups f WHERE f.patient_id = p.id) as last_follow_up
        FROM patients p
        LEFT JOIN villages v ON p.village_id = v.id`;
    
    const whereClauses = [];
    const params = [];

    if (searchTerm) {
        whereClauses.push(`p.name LIKE ?`);
        params.push(`%${searchTerm}%`);
    }
    if (startDate) {
        whereClauses.push(`p.registration_date >= ?`);
        params.push(startDate);
    }
    if (endDate) {
        whereClauses.push(`p.registration_date <= ?`);
        params.push(endDate);
    }

    if (whereClauses.length > 0) {
        sql += ` WHERE ${whereClauses.join(' AND ')}`;
    }

    sql += ` GROUP BY p.id, p.name, v.name, p.registration_date ORDER BY p.name ASC`;
    
    const [records] = await db.query(sql, params);
    return records;
};

app.get('/api/patient-records', async (req, res) => {
    try {
        const records = await getPatientRecords(req.query);
        res.json(records);
    } catch (err) { console.error(err); res.status(500).send("Server error"); }
});

const getDemographicsData = async () => {
    const sql = `
        SELECT
            v.name AS village_name, COUNT(p.id) AS total_patients,
            SUM(CASE WHEN p.caste = 'General' THEN 1 ELSE 0 END) AS general_count,
            SUM(CASE WHEN p.caste = 'SC/ST' THEN 1 ELSE 0 END) AS sc_st_count,
            SUM(CASE WHEN p.caste = 'Others' THEN 1 ELSE 0 END) AS others_count
        FROM patients p JOIN villages v ON p.village_id = v.id
        GROUP BY v.name ORDER BY v.name ASC`;
    const [results] = await db.query(sql);
    return results;
};

app.get('/api/demographics-report', async (req, res) => {
    try {
        const data = await getDemographicsData();
        res.json(data);
    } catch (err) { console.error(err); res.status(500).send("Server Error"); }
});


const getCumulativeData = async (year) => {
    const [patients] = await db.query('SELECT *, DATE_FORMAT(registration_date, "%m") as month FROM patients WHERE YEAR(registration_date) = ?', [year]);
    const [followUps] = await db.query('SELECT f.patient_id, p.program_type, p.caste, p.village_id, DATE_FORMAT(f.follow_up_date, "%m") as month, f.complaint_of, f.haemoglobin FROM follow_ups f JOIN patients p ON f.patient_id = p.id WHERE YEAR(f.follow_up_date) = ?', [year]);
    const [labTests] = await db.query('SELECT l.patient_id, p.program_type, DATE_FORMAT(l.test_date, "%m") as month FROM lab_tests l JOIN patients p ON l.patient_id = p.id WHERE YEAR(l.test_date) = ?', [year]);

    const parameters = [
        'VILLAGE VISITED', 'NO OF PATIENTS REGISTERED', 'NO OF FEMALE PATIENTS', 'NO OF INFANTS <Below 5 year>',
        'GEN_COUNT', 'SC_ST_COUNT', 'OTHERS_COUNT', 'DIAGNOSTIC_SERVICES_AVAILED',
        'ANC_SERVICES', 'ANC_GEN', 'ANC_SC_ST', 'ANC_OTHERS', 'ANC_DIAGNOSTIC_SERVICES', 'PNC_SERVICES',
        'FEVER', 'DIARRHEA', 'UPPER_RESPIRATORY_INFECTION', 'WORM_INFESTATION', 'ANEMIA', 'CATARACT',
        'EYE_INFECTION_INJURY', 'EAR_DISCHARGE', 'DENTAL_GUM_DISEASES', 'SKIN_DISEASES'
    ];
    
    const report = {};
    const months = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];
    parameters.forEach(p => {
        report[p] = {};
        months.forEach(m => report[p][m] = 0);
    });

    patients.forEach(p => {
        const month = p.month;
        report['NO OF PATIENTS REGISTERED'][month]++;
        if (p.sex === 'Female') report['NO OF FEMALE PATIENTS'][month]++;
        if (p.age < 5) report['NO OF INFANTS <Below 5 year>'][month]++;
        if (p.caste === 'General') report['GEN_COUNT'][month]++;
        else if (p.caste === 'SC/ST') report['SC_ST_COUNT'][month]++;
        else if (p.caste === 'Others') report['OTHERS_COUNT'][month]++;

        if (p.program_type === 'ANC') {
            report['ANC_SERVICES'][month]++;
            if (p.caste === 'General') report['ANC_GEN'][month]++;
            else if (p.caste === 'SC/ST') report['ANC_SC_ST'][month]++;
            else if (p.caste === 'Others') report['ANC_OTHERS'][month]++;
        }
        if (p.program_type === 'PNC') report['PNC_SERVICES'][month]++;
        if (p.program_type === 'CATARACT') report['CATARACT'][month]++;
    });

    const monthlyDiagnosticPatients = {};
    const monthlyANCDiagnosticPatients = {};
    labTests.forEach(test => {
        if (!monthlyDiagnosticPatients[test.month]) monthlyDiagnosticPatients[test.month] = new Set();
        monthlyDiagnosticPatients[test.month].add(test.patient_id);
        if (test.program_type === 'ANC') {
            if (!monthlyANCDiagnosticPatients[test.month]) monthlyANCDiagnosticPatients[test.month] = new Set();
            monthlyANCDiagnosticPatients[test.month].add(test.patient_id);
        }
    });
    months.forEach(month => {
        report['DIAGNOSTIC_SERVICES_AVAILED'][month] = monthlyDiagnosticPatients[month] ? monthlyDiagnosticPatients[month].size : 0;
        report['ANC_DIAGNOSTIC_SERVICES'][month] = monthlyANCDiagnosticPatients[month] ? monthlyANCDiagnosticPatients[month].size : 0;
    });

    followUps.forEach(fu => {
        const month = fu.month;
        const complaint = (fu.complaint_of || '').toLowerCase();
        if (complaint.includes('fever')) report['FEVER'][month]++;
        if (complaint.includes('diarrhea')) report['DIARRHEA'][month]++;
        if (complaint.includes('respiratory')) report['UPPER_RESPIRATORY_INFECTION'][month]++;
        if (complaint.includes('worm')) report['WORM_INFESTATION'][month]++;
        if (complaint.includes('eye')) report['EYE_INFECTION_INJURY'][month]++;
        if (complaint.includes('ear')) report['EAR_DISCHARGE'][month]++;
        if (complaint.includes('dental') || complaint.includes('gum')) report['DENTAL_GUM_DISEASES'][month]++;
        if (complaint.includes('skin')) report['SKIN_DISEASES'][month]++;
        if (parseFloat(fu.haemoglobin) < 11) report['ANEMIA'][month]++;
    });

    const villageVisits = {};
    [...patients, ...followUps].forEach(visit => {
        if (!visit.month || !visit.village_id) return;
        if (!villageVisits[visit.month]) villageVisits[visit.month] = new Set();
        villageVisits[visit.month].add(visit.village_id);
    });
    months.forEach(month => {
        report['VILLAGE VISITED'][month] = villageVisits[month] ? villageVisits[month].size : 0;
    });

    Object.keys(report).forEach(param => {
        report[param].total = months.reduce((sum, month) => sum + (report[param][month] || 0), 0);
    });

    return report;
};


const getReportData = async (filters) => {
    const { startDate, endDate, villages, programs, castes } = filters;
    
    let whereClauses = [];
    const params = [];

    if (startDate) {
        whereClauses.push(`visit_date >= ?`);
        params.push(startDate);
    }
    if (endDate) {
        whereClauses.push(`visit_date <= ?`);
        params.push(endDate);
    }
    if (villages && villages.length > 0) {
        whereClauses.push(`village_name IN (?)`);
        params.push(villages.split(','));
    }
    if (programs && programs.length > 0) {
        whereClauses.push(`program_type IN (?)`);
        params.push(programs.split(','));
    }
    if (castes && castes.length > 0) {
        whereClauses.push(`caste IN (?)`);
        params.push(castes.split(','));
    }

    const whereString = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
    
    const sql = `
        SELECT * FROM (
            SELECT 
                p.id as patient_id, 
                p.name as patient_name, 
                v.name as village_name, 
                p.program_type, 
                p.caste, 
                p.registration_date as visit_date, 
                'Initial Visit' as visit_type
            FROM patients p
            LEFT JOIN villages v ON p.village_id = v.id
            
            UNION ALL
            
            SELECT 
                f.patient_id, 
                p.name as patient_name, 
                v.name as village_name, 
                p.program_type, 
                p.caste, 
                f.follow_up_date as visit_date, 
                'Follow-up' as visit_type
            FROM follow_ups f
            JOIN patients p ON f.patient_id = p.id
            LEFT JOIN villages v ON p.village_id = v.id
        ) as all_visits
        ${whereString}
        ORDER BY visit_date DESC`;

    const [results] = await db.query(sql, params);
    return results;
};
const getSummaryReportData = async (filters) => {
    const { startDate, endDate } = filters;
    let sql = `SELECT v.name AS village_name, COUNT(DISTINCT p.id) AS patient_count, GROUP_CONCAT(DISTINCT f.medicine_prescribed SEPARATOR ', ') AS medicines_given, AVG(CAST(SUBSTRING_INDEX(f.blood_pressure, '/', 1) AS UNSIGNED)) as avg_systolic, AVG(CAST(SUBSTRING_INDEX(f.blood_pressure, '/', -1) AS UNSIGNED)) as avg_diastolic, AVG(CAST(f.heartbeat AS UNSIGNED)) as avg_heartbeat FROM follow_ups f JOIN patients p ON f.patient_id = p.id JOIN villages v ON p.village_id = v.id WHERE 1=1`;
    const params = [];
    if (startDate) { sql += ` AND f.follow_up_date >= ?`; params.push(startDate); } if (endDate) { sql += ` AND f.follow_up_date <= ?`; params.push(endDate); }
    sql += ` GROUP BY v.name ORDER BY v.name`; const [results] = await db.query(sql, params); return results;
};

// --- API ENDPOINTS ---
app.get('/api/report', async (req, res) => { 
    try {
        const results = await getReportData(req.query);
        const total_visits = results.length;
        const unique_patients = new Set(results.map(r => r.patient_id)).size;
        const follow_up_visits = results.filter(r => r.visit_type === 'Follow-up').length;

        res.json({
            total_visits,
            unique_patients,
            follow_up_visits,
            data: results
        });
    } catch (e) {
        console.error(e);
        res.status(500).send();
    }
});
app.get('/api/summary-report', async (req, res) => { try { const r = await getSummaryReportData(req.query); res.json(r); } catch (e) { console.error(e); res.status(500).send(); } });
app.get('/api/cumulative-report', async (req, res) => { try { const y = req.query.year || new Date().getFullYear(); const d = await getCumulativeData(y); res.json(d); } catch (e) { console.error(e); res.status(500).send(); } });
app.get('/api/villages', async (req, res) => { try { const [v] = await db.query('SELECT name FROM villages ORDER BY name ASC'); res.json(v); } catch (e) { res.status(500).send(); } });


// --- EXPORT ENDPOINTS ---
app.get('/api/export', async (req, res) => { 
    try { 
        const r = await getReportData(req.query); 
        const w = new excel.Workbook(); 
        const ws = w.addWorksheet('Visitor Report'); 
        ws.columns = [
            { header: 'Visit Date', key: 'visit_date', width: 15 },
            { header: 'Patient', key: 'patient_name', width: 25 },
            { header: 'Village', key: 'village_name', width: 20 },
            { header: 'Program', key: 'program_type', width: 15 },
            { header: 'Caste', key: 'caste', width: 15 },
            { header: 'Visit Type', key: 'visit_type', width: 15 }
        ]; 
        ws.addRows(r); 
        res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'); 
        res.setHeader('Content-Disposition','attachment; filename=visitor_report.xlsx'); 
        await w.xlsx.write(res); 
        res.end(); 
    } catch (e) { console.error(e); res.status(500).send(); } 
});

app.get('/api/summary-report/export', async (req, res) => { 
    try { 
        const r = await getSummaryReportData(req.query); 
        const w = new excel.Workbook(); 
        const ws = w.addWorksheet('Village Summary'); 
        ws.columns = [
            { header: 'Village', key: 'village_name', width: 25 },
            { header: 'Patients', key: 'patient_count', width: 15 },
            { header: 'Avg. BP', key: 'avg_bp', width: 15 },
            { header: 'Avg. Heartbeat', key: 'avg_heartbeat', width: 15 },
            { header: 'Medicines', key: 'medicines_given', width: 50 }
        ]; 
        const d = r.map(row => ({
            ...row,
            avg_bp: (row.avg_systolic && row.avg_diastolic) ? `${Math.round(row.avg_systolic)}/${Math.round(row.avg_diastolic)}` : 'N/A',
            avg_heartbeat: row.avg_heartbeat ? Math.round(row.avg_heartbeat) : 'N/A'
        })); 
        ws.addRows(d); 
        res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'); 
        res.setHeader('Content-Disposition','attachment; filename=village_summary_report.xlsx'); 
        await w.xlsx.write(res); 
        res.end(); 
    } catch (e) { console.error(e); res.status(500).send(); } 
});

app.get('/api/medicines/export', async (req, res) => { 
    try { 
        const [m] = await db.query('SELECT *, DATE_FORMAT(expiration_date, "%Y-%m-%d") as expiration_date FROM medicine_inventory ORDER BY name ASC'); 
        const w = new excel.Workbook(); 
        const ws = w.addWorksheet('Medicine Inventory'); 
        ws.columns = [
            { header: 'ID', key: 'id', width: 10 },
            { header: 'Name', key: 'name', width: 30 },
            { header: 'Stock', key: 'stock_count', width: 15 },
            { header: 'Expiry', key: 'expiration_date', width: 20 }
        ]; 
        ws.addRows(m); 
        res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'); 
        res.setHeader('Content-Disposition','attachment; filename=medicine_inventory.xlsx'); 
        await w.xlsx.write(res); 
        res.end(); 
    } catch (e) { console.error(e); res.status(500).send(); } 
});

app.get('/api/patient-records/export', async (req, res) => { 
    try { 
        const r = await getPatientRecords(req.query); 
        const w = new excel.Workbook(); 
        const ws = w.addWorksheet('Patient Records'); 
        ws.columns = [
            { header: 'ID', key: 'id', width: 15 },
            { header: 'Name', key: 'name', width: 30 },
            { header: 'Village', key: 'village_name', width: 25 },
            { header: 'Reg. Date', key: 'registration_date', width: 20 },
            { header: 'Last Follow-up', key: 'last_follow_up', width: 20 }
        ]; 
        ws.addRows(r); 
        res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'); 
        res.setHeader('Content-Disposition','attachment; filename=patient_records.xlsx'); 
        await w.xlsx.write(res); 
        res.end(); 
    } catch (err) { console.error(err); res.status(500).send(); }
});

app.get('/api/patient-records/export-details', async (req, res) => {
    try {
        const workbook = new excel.Workbook();

        const [patients] = await db.query('SELECT p.*, v.name as village_name FROM patients p LEFT JOIN villages v ON p.village_id = v.id ORDER BY p.name ASC');
        const [followUps] = await db.query('SELECT * FROM follow_ups ORDER BY patient_id, follow_up_date DESC');
        const [ancDetails] = await db.query('SELECT * FROM anc_details');
        const [pncDetails] = await db.query('SELECT * FROM pnc_details');

        const patientsSheet = workbook.addWorksheet('Patients');
        patientsSheet.columns = [
            { header: 'Patient ID', key: 'id', width: 10 },
            { header: 'Name', key: 'name', width: 30 },
            { header: 'Husband/Father Name', key: 'husband_father_name', width: 30 },
            { header: 'Age', key: 'age', width: 10 },
            { header: 'Sex', key: 'sex', width: 10 },
            { header: 'Village', key: 'village_name', width: 20 },
            { header: 'Program', key: 'program_type', width: 15 },
            { header: 'Caste', key: 'caste', width: 15 },
            { header: 'BPL Status', key: 'bpl_status', width: 15 },
            { header: 'Registration Date', key: 'registration_date', width: 20 },
        ];
        patientsSheet.addRows(patients);

        const followUpsSheet = workbook.addWorksheet('Follow-ups');
        if (followUps.length > 0) {
            followUpsSheet.columns = Object.keys(followUps[0]).map(key => ({ header: key.replace(/_/g, ' ').toUpperCase(), key: key, width: 20 }));
            followUpsSheet.addRows(followUps);
        }

        const ancSheet = workbook.addWorksheet('ANC Details');
        if (ancDetails.length > 0) {
            ancSheet.columns = Object.keys(ancDetails[0]).map(key => ({ header: key.replace(/_/g, ' ').toUpperCase(), key: key, width: 20 }));
            ancSheet.addRows(ancDetails);
        }

        const pncSheet = workbook.addWorksheet('PNC Details');
        if (pncDetails.length > 0) {
            pncSheet.columns = Object.keys(pncDetails[0]).map(key => ({ header: key.replace(/_/g, ' ').toUpperCase(), key: key, width: 20 }));
            pncSheet.addRows(pncDetails);
        }

        res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition','attachment; filename=patient_all_details.xlsx');
        await workbook.xlsx.write(res);
        res.end();

    } catch (err) {
        console.error(err);
        res.status(500).send("Server Error");
    }
});

app.get('/api/demographics-report/export', async (req, res) => { 
    try { 
        const d = await getDemographicsData(); 
        const w = new excel.Workbook(); 
        const ws = w.addWorksheet('Demographics Report'); 
        ws.columns = [
            { header: 'Village', key: 'village_name', width: 30 },
            { header: 'Total Patients', key: 'total_patients', width: 15 },
            { header: 'General', key: 'general_count', width: 15 },
            { header: 'SC/ST', key: 'sc_st_count', width: 15 },
            { header: 'Others', key: 'others_count', width: 15 }
        ]; 
        ws.addRows(d); 
        res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'); 
        res.setHeader('Content-Disposition','attachment; filename=demographics_report.xlsx'); 
        await w.xlsx.write(res); 
        res.end(); 
    } catch (e) { console.error(e); res.status(500).send(); }
});

app.get('/api/lab-records/export', async (req, res) => { 
    try { 
        const [r] = await db.query(`SELECT lt.*, p.name as patient_name, p.husband_father_name, p.age, p.sex, v.name as village_name, DATE_FORMAT(lt.test_date, '%Y-%m-%d') as test_date FROM lab_tests lt JOIN patients p ON lt.patient_id = p.id LEFT JOIN villages v ON p.village_id = v.id ORDER BY lt.test_date DESC`); 
        const w = new excel.Workbook(); 
        const ws = w.addWorksheet('Lab Records'); 
        ws.columns = [
            { header: 'Test Date', key: 'test_date', width: 15 },
            { header: 'Patient', key: 'patient_name', width: 25 },
            { header: 'Father/Husband', key: 'husband_father_name', width: 25 },
            { header: 'Age', key: 'age', width: 10 },
            { header: 'Sex', key: 'sex', width: 10 },
            { header: 'Village', key: 'village_name', width: 20 },
            { header: 'Test', key: 'test_name', width: 20 },
            { header: 'Positive', key: 'result_positive_reading', width: 20 },
            { header: 'Negative', key: 'result_negative_reading', width: 20 }
        ]; 
        ws.addRows(r); 
        res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'); 
        res.setHeader('Content-Disposition','attachment; filename=lab_records.xlsx'); 
        await w.xlsx.write(res); 
        res.end(); 
    } catch (err) { console.error(err); res.status(500).send(); }
});

app.get('/api/cumulative-report/export', async (req, res) => {
    try {
        const year = req.query.year || new Date().getFullYear();
        const data = await getCumulativeData(year);
        const workbook = new excel.Workbook();
        const worksheet = workbook.addWorksheet(`Cumulative Report ${year}`);
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        
        const parameters = [
            { key: 'VILLAGE VISITED', label: 'VILLAGE VISITED' }, { key: 'NO OF PATIENTS REGISTERED', label: 'NO OF PATIENTS REGISTERED' },
            { key: 'NO OF FEMALE PATIENTS', label: 'NO OF FEMALE PATIENTS' }, { key: 'NO OF INFANTS <Below 5 year>', label: 'NO OF INFANTS <Below 5 year>' },
            { key: 'GEN_COUNT', label: 'NO OF GEN PATIENTS' }, { key: 'SC_ST_COUNT', label: 'NO OF SC/ST PATIENTS' },
            { key: 'OTHERS_COUNT', label: 'NO OF OTHERS PATIENTS' }, { key: 'DIAGNOSTIC_SERVICES_AVAILED', label: 'NO OF PATIENTS WHO AVAILED ANY OF THE DIAGNOSTIC SERVICES' },
            { key: 'ANC_SERVICES', label: 'NO OF WOMEN WHO AVAILED ANC SERVICES' }, { key: 'ANC_GEN', label: 'NO OF GEN WOMEN WHO AVAILED ANC' },
            { key: 'ANC_SC_ST', label: 'NO OF SC/ST WOMEN WHO AVAILED ANC' }, { key: 'ANC_OTHERS', label: 'NO OF OTHERS WOMEN WHO AVAILED ANC' },
            { key: 'ANC_DIAGNOSTIC_SERVICES', label: 'NO OF WOMEN FOR ANC CHECKUPS WHO AVAILED DIAGNOSTIC SERVICES' }, { key: 'PNC_SERVICES', label: 'NO OF WOMEN WHO RECEIVED PNC SERVICES' },
            { key: 'FEVER', label: 'NO OF PATIENTS WITH FEVER' }, { key: 'DIARRHEA', label: 'NO OF PATIENTS WITH DIARRHEA' },
            { key: 'UPPER_RESPIRATORY_INFECTION', label: 'NO OF PATIENTS WITH UPPER RESPIRATORY INFECTION' }, { key: 'WORM_INFESTATION', label: 'NO OF PATIENTS WITH WORM INFESTATION' },
            { key: 'ANEMIA', label: 'NO OF PATIENTS WITH ANEMIA (Hb < 11)' }, { key: 'CATARACT', label: 'NO OF PATIENTS WITH EYE CATARACT' },
            { key: 'EYE_INFECTION_INJURY', label: 'NO OF PATIENTS WITH EYE INFECTION / INJURY' }, { key: 'EAR_DISCHARGE', label: 'NO OF PATIENTS WITH EAR DISCHARGE' },
            { key: 'DENTAL_GUM_DISEASES', label: 'NO OF PATIENTS WITH DENTAL AND GUM DISEASES' }, { key: 'SKIN_DISEASES', label: 'NO OF PATIENTS WITH SKIN DISEASES' }
        ];

        worksheet.columns = [
            { header: 'Reporting Parameters', key: 'label', width: 50 },
            ...months.map(m => ({ header: m, key: m, width: 8 })),
            { header: 'Total', key: 'total', width: 10 }
        ];

        parameters.forEach(p => {
            const rowData = { label: p.label };
            const paramData = data[p.key] || {};
            months.forEach((_, index) => {
                const monthKey = String(index + 1).padStart(2, '0');
                rowData[monthKey] = paramData[monthKey] || 0;
            });
            rowData.total = paramData.total || 0;
            worksheet.addRow(rowData);
        });

        res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition',`attachment; filename=cumulative_report_${year}.xlsx`);
        await workbook.xlsx.write(res);
        res.end();
    } catch(e) { console.error(e); res.status(500).send(); }
});

app.get('/api/logbook/export', async (req, res) => {
    try {
        const [entries] = await db.query(`SELECT *, DATE_FORMAT(entry_date, '%Y-%m-%d') as entry_date FROM logbook ORDER BY entry_date DESC`);
        const workbook = new excel.Workbook();
        const worksheet = workbook.addWorksheet('Logbook');
        worksheet.columns = [
            { header: 'Date', key: 'entry_date', width: 15 },
            { header: 'Time Out', key: 'time_out', width: 12 },
            { header: 'Time In', key: 'time_in', width: 12 },
            { header: 'Opening KMs', key: 'kms_opening', width: 15 },
            { header: 'Closing KMs', key: 'kms_closing', width: 15 },
            { header: 'Total KMs', key: 'total_kms', width: 15 },
            { header: 'Fuel Qty (L)', key: 'fuel_quantity', width: 15 },
            { header: 'Villages Visited', key: 'villages_visited', width: 40 },
        ];
        worksheet.addRows(entries);
        res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition','attachment; filename=logbook_export.xlsx');
        await workbook.xlsx.write(res);
        res.end();
    } catch (err) { console.error(err); res.status(500).send("Server error"); }
});

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});

