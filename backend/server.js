require('dotenv').config();
const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const excel = require('exceljs');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const db = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
}).promise();

// --- PATIENT ENDPOINTS ---
app.post('/api/patients', async (req, res) => {
    const { name, husband_father_name, age, sex, village_name, program_type, caste, registration_date } = req.body;
    try {
        let [villages] = await db.query('SELECT id FROM villages WHERE name = ?', [village_name]);
        let village_id;
        if (villages.length > 0) { village_id = villages[0].id; }
        else { const [result] = await db.query('INSERT INTO villages (name) VALUES (?)', [village_name]); village_id = result.insertId; }
        
        const patient = { name, husband_father_name, age, sex, village_id, program_type, caste, registration_date };
        const [result] = await db.query('INSERT INTO patients SET ?', patient);
        res.status(201).json({ id: result.insertId, ...patient });
    } catch (err) { console.error(err); res.status(500).send("Server error"); }
});

app.get('/api/patients/list', async (req, res) => {
    try {
        const [patients] = await db.query('SELECT id, name FROM patients ORDER BY name ASC');
        res.json(patients);
    } catch (err) { console.error(err); res.status(500).send("Server error"); }
});

app.get('/api/patients/:id', async (req, res) => {
    try {
        const [patients] = await db.query(`
            SELECT p.id, p.name, p.husband_father_name, p.age, p.sex, v.name as village_name
            FROM patients p
            LEFT JOIN villages v ON p.village_id = v.id
            WHERE p.id = ?`, [req.params.id]);
        if (patients.length > 0) {
            res.json(patients[0]);
        } else {
            res.status(404).send('Patient not found');
        }
    } catch (err) { console.error(err); res.status(500).send("Server error"); }
});

// --- REPORTING LOGIC & DATA FETCHERS ---
const getPatientRecords = async () => {
    const sql = `
        SELECT
            p.id, p.name, v.name as village_name,
            DATE_FORMAT(p.registration_date, '%Y-%m-%d') as registration_date,
            (SELECT MAX(DATE_FORMAT(f.follow_up_date, '%Y-%m-%d')) FROM follow_ups f WHERE f.patient_id = p.id) as last_follow_up
        FROM patients p
        LEFT JOIN villages v ON p.village_id = v.id
        GROUP BY p.id, p.name, v.name, p.registration_date
        ORDER BY p.name ASC`;
    const [records] = await db.query(sql);
    return records;
};

app.get('/api/patient-records', async (req, res) => {
    try {
        const records = await getPatientRecords();
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
    let sql = `SELECT f.*, p.name as patient_name, v.name as village_name, p.program_type, p.caste FROM follow_ups f JOIN patients p ON f.patient_id = p.id LEFT JOIN villages v ON p.village_id = v.id WHERE 1=1`;
    const params = [];
    if (startDate) { sql += ` AND f.follow_up_date >= ?`; params.push(startDate); } if (endDate) { sql += ` AND f.follow_up_date <= ?`; params.push(endDate); }
    if (villages) { sql += ` AND v.name IN (?)`; params.push(villages.split(',')); } if (programs) { sql += ` AND p.program_type IN (?)`; params.push(programs.split(',')); }
    if (castes) { sql += ` AND p.caste IN (?)`; params.push(castes.split(',')); } sql += ` ORDER BY f.follow_up_date DESC`;
    const [results] = await db.query(sql, params); return results;
};
const getSummaryReportData = async (filters) => {
    const { startDate, endDate } = filters;
    let sql = `SELECT v.name AS village_name, COUNT(DISTINCT p.id) AS patient_count, GROUP_CONCAT(DISTINCT f.medicine_prescribed SEPARATOR ', ') AS medicines_given, AVG(CAST(SUBSTRING_INDEX(f.blood_pressure, '/', 1) AS UNSIGNED)) as avg_systolic, AVG(CAST(SUBSTRING_INDEX(f.blood_pressure, '/', -1) AS UNSIGNED)) as avg_diastolic, AVG(CAST(f.heartbeat AS UNSIGNED)) as avg_heartbeat FROM follow_ups f JOIN patients p ON f.patient_id = p.id JOIN villages v ON p.village_id = v.id WHERE 1=1`;
    const params = [];
    if (startDate) { sql += ` AND f.follow_up_date >= ?`; params.push(startDate); } if (endDate) { sql += ` AND f.follow_up_date <= ?`; params.push(endDate); }
    sql += ` GROUP BY v.name ORDER BY v.name`; const [results] = await db.query(sql, params); return results;
};

// --- API ENDPOINTS ---
app.get('/api/report', async (req, res) => { try { const r = await getReportData(req.query); res.json({ count: r.length, data: r }); } catch (e) { res.status(500).send(); } });
app.get('/api/summary-report', async (req, res) => { try { const r = await getSummaryReportData(req.query); res.json(r); } catch (e) { res.status(500).send(); } });
app.get('/api/cumulative-report', async (req, res) => { try { const y = req.query.year || new Date().getFullYear(); const d = await getCumulativeData(y); res.json(d); } catch (e) { res.status(500).send(); } });

// --- OTHER ENDPOINTS (VILLAGE, FOLLOW-UP, MEDICINE, LAB, LOGBOOK) ---
app.get('/api/villages', async (req, res) => { try { const [v] = await db.query('SELECT name FROM villages ORDER BY name ASC'); res.json(v); } catch (e) { res.status(500).send(); } });
app.post('/api/followups', async (req, res) => { try { const [r] = await db.query('INSERT INTO follow_ups SET ?', req.body); res.status(201).json({id: r.insertId}); } catch (e) { res.status(500).send(); } });
app.get('/api/medicines', async (req, res) => { try { const [m] = await db.query('SELECT *, DATE_FORMAT(expiration_date, "%Y-%m-%d") as expiration_date FROM medicine_inventory ORDER BY name ASC'); res.json(m); } catch (e) { res.status(500).send(); } });
app.post('/api/medicines', async (req, res) => { try { const [r] = await db.query('INSERT INTO medicine_inventory SET ?', req.body); res.status(201).json({id: r.insertId}); } catch (e) { res.status(500).send(); } });
app.put('/api/medicines/:id', async (req, res) => { try { await db.query('UPDATE medicine_inventory SET stock_count = ? WHERE id = ?', [req.body.stock_count, req.params.id]); res.sendStatus(200); } catch (e) { res.status(500).send(); } });
app.delete('/api/medicines/:id', async (req, res) => { try { await db.query('DELETE FROM medicine_inventory WHERE id = ?', [req.params.id]); res.sendStatus(204); } catch (e) { res.status(500).send(); } });
app.post('/api/lab-records', async (req, res) => { try { const r = await db.query('INSERT INTO lab_tests SET ?', req.body); res.status(201).json({ id: r[0].insertId }); } catch (err) { res.status(500).send(); }});
app.get('/api/lab-records', async (req, res) => { try { const [r] = await db.query(`SELECT lt.*, p.name as patient_name, p.husband_father_name, p.sex, DATE_FORMAT(lt.test_date, '%Y-%m-%d') as test_date FROM lab_tests lt JOIN patients p ON lt.patient_id = p.id ORDER BY lt.test_date DESC, p.name ASC`); res.json(r); } catch (err) { res.status(500).send(); }});
app.post('/api/logbook', async (req, res) => { try { const [r] = await db.query('INSERT INTO logbook SET ?', req.body); res.status(201).json({ id: r.insertId }); } catch (err) { res.status(500).send(); }});
app.get('/api/logbook', async (req, res) => { try { const [e] = await db.query(`SELECT *, DATE_FORMAT(entry_date, '%Y-%m-%d') as entry_date FROM logbook ORDER BY entry_date DESC`); res.json(e); } catch (err) { res.status(500).send(); }});

// --- EXPORT ENDPOINTS ---
app.get('/api/export', async (req, res) => { try { const r = await getReportData(req.query); const w = new excel.Workbook(); const ws = w.addWorksheet('Follow-up Report'); ws.columns = [{h:'ID',k:'id',w:10},{h:'Patient',k:'patient_name',w:25},{h:'Village',k:'village_name',w:20},{h:'Program',k:'program_type',w:15},{h:'Caste',k:'caste',w:15},{h:'Date',k:'follow_up_date',w:15},{h:'BP',k:'blood_pressure',w:15},{h:'Complaint',k:'complaint_of',w:40}]; ws.addRows(r); res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'); res.setHeader('Content-Disposition','attachment; filename=follow_up_report.xlsx'); await w.xlsx.write(res); res.end(); } catch (e) { res.status(500).send(); } });
app.get('/api/summary-report/export', async (req, res) => { try { const r = await getSummaryReportData(req.query); const w = new excel.Workbook(); const ws = w.addWorksheet('Village Summary'); ws.columns = [{h:'Village',k:'village_name',w:25},{h:'Patients',k:'patient_count',w:15},{h:'Avg. BP',k:'avg_bp',w:15},{h:'Avg. Heartbeat',k:'avg_heartbeat',w:15},{h:'Medicines',k:'medicines_given',w:50}]; const d = r.map(row => ({...row,avg_bp:(row.avg_systolic&&row.avg_diastolic)?`${Math.round(row.avg_systolic)}/${Math.round(row.avg_diastolic)}`:'N/A',avg_heartbeat:row.avg_heartbeat?Math.round(row.avg_heartbeat):'N/A'})); ws.addRows(d); res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'); res.setHeader('Content-Disposition','attachment; filename=village_summary_report.xlsx'); await w.xlsx.write(res); res.end(); } catch (e) { res.status(500).send(); } });
app.get('/api/medicines/export', async (req, res) => { try { const [m] = await db.query('SELECT *, DATE_FORMAT(expiration_date, "%Y-%m-%d") as expiration_date FROM medicine_inventory ORDER BY name ASC'); const w = new excel.Workbook(); const ws = w.addWorksheet('Medicine Inventory'); ws.columns = [{h:'ID',k:'id',w:10},{h:'Name',k:'name',w:30},{h:'Stock',k:'stock_count',w:15},{h:'Expiry',k:'expiration_date',w:20}]; ws.addRows(m); res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'); res.setHeader('Content-Disposition','attachment; filename=medicine_inventory.xlsx'); await w.xlsx.write(res); res.end(); } catch (e) { res.status(500).send(); } });
app.get('/api/patient-records/export', async (req, res) => { try { const r = await getPatientRecords(); const w = new excel.Workbook(); const ws = w.addWorksheet('Patient Records'); ws.columns = [{h:'ID',k:'id',w:15},{h:'Name',k:'name',w:30},{h:'Village',k:'village_name',w:25},{h:'Reg. Date',k:'registration_date',w:20},{h:'Last Follow-up',k:'last_follow_up',w:20}]; ws.addRows(r); res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'); res.setHeader('Content-Disposition','attachment; filename=patient_records.xlsx'); await w.xlsx.write(res); res.end(); } catch (err) { res.status(500).send(); }});
app.get('/api/demographics-report/export', async (req, res) => { try { const d = await getDemographicsData(); const w = new excel.Workbook(); const ws = w.addWorksheet('Demographics Report'); ws.columns = [{h:'Village',k:'village_name',w:30},{h:'Total Patients',k:'total_patients',w:15},{h:'General',k:'general_count',w:15},{h:'SC/ST',k:'sc_st_count',w:15},{h:'Others',k:'others_count',w:15}]; ws.addRows(d); res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'); res.setHeader('Content-Disposition','attachment; filename=demographics_report.xlsx'); await w.xlsx.write(res); res.end(); } catch (e) { res.status(500).send(); }});
app.get('/api/lab-records/export', async (req, res) => { try { const [r] = await db.query(`SELECT lt.*, p.name as patient_name, p.husband_father_name, p.age, p.sex, v.name as village_name, DATE_FORMAT(lt.test_date, '%Y-%m-%d') as test_date FROM lab_tests lt JOIN patients p ON lt.patient_id = p.id LEFT JOIN villages v ON p.village_id = v.id ORDER BY lt.test_date DESC`); const w = new excel.Workbook(); const ws = w.addWorksheet('Lab Records'); ws.columns = [{h:'Test Date',k:'test_date',w:15},{h:'Patient',k:'patient_name',w:25},{h:'Father/Husband',k:'husband_father_name',w:25},{h:'Age',k:'age',w:10},{h:'Sex',k:'sex',w:10},{h:'Village',k:'village_name',w:20},{h:'Test',k:'test_name',w:20},{h:'Positive',k:'result_positive_reading',w:20},{h:'Negative',k:'result_negative_reading',w:20}]; ws.addRows(r); res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'); res.setHeader('Content-Disposition','attachment; filename=lab_records.xlsx'); await w.xlsx.write(res); res.end(); } catch (err) { res.status(500).send(); }});
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
            months.forEach((month, index) => {
                const monthKey = String(index + 1).padStart(2, '0');
                rowData[month] = paramData[monthKey] || 0;
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
            { header: 'Time In', key: 'time_in', width: 12 },
            { header: 'Time Out', key: 'time_out', width: 12 },
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