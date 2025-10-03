$(document).ready(function() {
    const apiBaseUrl = 'http://192.168.1.10:3000'; 

    // --- Page Navigation Logic ---
    function showPage(pageId) {
        $('#page-dashboard, #page-records, #page-demographics, #page-lab, #page-reports, #page-logbook').addClass('d-none');
        $(`#${pageId}`).removeClass('d-none');
    }

    $('#nav-dashboard').on('click', function(e) { e.preventDefault(); $('.nav-link').removeClass('active'); $(this).addClass('active'); showPage('page-dashboard'); });
    $('#nav-records').on('click', function(e) { e.preventDefault(); $('.nav-link').removeClass('active'); $(this).addClass('active'); showPage('page-records'); fetchPatientRecords(); });
    $('#nav-demographics').on('click', function(e) { e.preventDefault(); $('.nav-link').removeClass('active'); $(this).addClass('active'); showPage('page-demographics'); fetchDemographicsReport(); });
    $('#nav-lab').on('click', function(e) { e.preventDefault(); $('.nav-link').removeClass('active'); $(this).addClass('active'); showPage('page-lab'); fetchLabRecords(); });
    $('#nav-logbook').on('click', function(e) { e.preventDefault(); $('.nav-link').removeClass('active'); $(this).addClass('active'); showPage('page-logbook'); fetchLogbookEntries(); });
    $('#nav-reports').on('click', function(e) { e.preventDefault(); $('.nav-link').removeClass('active'); $(this).addClass('active'); showPage('page-reports'); fetchCumulativeReport(); });


    // --- Patient Registration Logic ---
    $('#add-patient-form').on('submit', function(e) {
        e.preventDefault();
        const newPatient = {
            registration_date: $('#registration_date').val(), name: $('#name').val(), husband_father_name: $('#husband_father_name').val(), 
            age: $('#age').val(), sex: $('#sex').val(), village_name: $('#village_name').val(), 
            program_type: $('#program_type').val(), caste: $('#caste').val()
        };
        if (!newPatient.registration_date) { alert('Date of Visit is required.'); return; }
        if (!newPatient.village_name.trim()) { alert('Village name is required.'); return; }
        $.ajax({
            url: `${apiBaseUrl}/api/patients`, type: 'POST', contentType: 'application/json', data: JSON.stringify(newPatient),
            success: function() {
                alert('Patient added successfully!');
                $('#add-patient-form')[0].reset();
                populateVillageFilter();
                populateAllPatientDropdowns(); 
            },
            error: function() { alert('Error: Could not add patient.'); }
        });
    });

    // --- Follow-up Logic ---
    $('#add-follow-up-form').on('submit', function(e) {
        e.preventDefault();
        const followUpData = {
            patient_id: $('#fu-patient-id').val(), follow_up_date: $('#fu-date').val(),
            pulse: $('#fu-pulse').val() || null, respiratory_rate: $('#fu-respiratory-rate').val() || null, temperature: $('#fu-temperature').val() || null,
            blood_pressure: $('#fu-blood-pressure').val() || null, weight_kg: $('#fu-weight').val() || null, height_cm: $('#fu-height').val() || null,
            random_blood_sugar: $('#fu-rbs').val() || null, haemoglobin: $('#fu-hb').val() || null,
            known_case_of: $('#fu-kco').val() || null, history_of: $('#fu-ho').val() || null, complaint_of: $('#fu-co').val() || null,
            on_examination: $('#fu-oe').val() || null, treatment_advised: $('#fu-treatment').val() || null, medicine_prescribed: $('#fu-medicine').val() || null,
            follow_up_notes: $('#fu-follow-up-notes').val() || null, last_menstrual_period: $('#fu-lmp').val() || null,
            expected_delivery_date: $('#fu-edd').val() || null, heartbeat: $('#fu-heartbeat').val() || null, urine_sugar: $('#fu-urine-sugar').val() || null,
            urine_albumin: $('#fu-urine-albumin').val() || null
        };
        if (!followUpData.patient_id || !followUpData.follow_up_date) { alert('Please select a patient and a follow-up date.'); return; }
        $.ajax({
            url: `${apiBaseUrl}/api/followups`, type: 'POST', contentType: 'application/json', data: JSON.stringify(followUpData),
            success: () => { alert('Follow-up saved!'); $('#add-follow-up-form')[0].reset(); },
            error: () => alert('Error saving follow-up.')
        });
    });
    
    // --- Populating Patient Dropdowns ---
    function populateAllPatientDropdowns() {
        $.get(`${apiBaseUrl}/api/patients/list`, function(patients) {
            const fu_filter = $('#fu-patient-id');
            const lab_filter = $('#lab-patient-id');
            fu_filter.html('<option value="">-- Please Select --</option>');
            lab_filter.html('<option value="">-- Please Select --</option>');
            patients.forEach(p => {
                fu_filter.append(`<option value="${p.id}">${p.name}</option>`);
                lab_filter.append(`<option value="${p.id}">${p.name}</option>`);
            });
        });
    }

    // --- Reporting Logic ---
    function populateVillageFilter() {
        $.get(`${apiBaseUrl}/api/villages`, function(villages) {
            const container = $('#filter-village-checkboxes');
            container.empty();
            villages.forEach(v => {
                container.append(`<div class="form-check"><input class="form-check-input" type="checkbox" value="${v.name}" id="village_${v.name.replace(/\s+/g, '')}"><label class="form-check-label" for="village_${v.name.replace(/\s+/g, '')}">${v.name}</label></div>`);
            });
        });
    }

    function populateProgramAndCasteFilters() {
        const programs = ['General', 'HTN', 'DM', 'ANC', 'PNC', 'CATARACT'];
        const castes = ['General', 'SC/ST', 'Others'];
        const progContainer = $('#filter-program-checkboxes');
        const casteContainer = $('#filter-caste-checkboxes');
        progContainer.empty();
        casteContainer.empty();
        programs.forEach(p => {
            progContainer.append(`<div class="form-check"><input class="form-check-input" type="checkbox" value="${p}" id="program_${p}"><label class="form-check-label" for="program_${p}">${p}</label></div>`);
        });
        castes.forEach(c => {
            casteContainer.append(`<div class="form-check"><input class="form-check-input" type="checkbox" value="${c}" id="caste_${c.replace('/','')}"><label class="form-check-label" for="caste_${c.replace('/','')}">${c}</label></div>`);
        });
    }

    $('#generate-report-btn').on('click', function() {
        const reportUrl = new URL(`${apiBaseUrl}/api/report`);
        const selectedVillages = $('#filter-village-checkboxes :checked').map((_, el) => $(el).val()).get();
        const selectedPrograms = $('#filter-program-checkboxes :checked').map((_, el) => $(el).val()).get();
        const selectedCastes = $('#filter-caste-checkboxes :checked').map((_, el) => $(el).val()).get();
        const params = {
            startDate: $('#filter-start-date').val(), endDate: $('#filter-end-date').val(),
            villages: selectedVillages.join(','), programs: selectedPrograms.join(','), castes: selectedCastes.join(',')
        };
        Object.keys(params).forEach(key => { if(params[key]) reportUrl.searchParams.set(key, params[key]) });
        $('#report-table-container').html('<p class="text-muted text-center">Loading...</p>');
        $('#export-excel-btn').prop('disabled', true);
        $.get(reportUrl.toString(), function(response) {
            $('#report-count').text(response.count);
            renderReportTable(response.data);
            if(response.count > 0) $('#export-excel-btn').prop('disabled', false);
        }).fail(() => $('#report-table-container').html('<p class="text-danger text-center">Failed to load report.</p>'));
    });

    function renderReportTable(data) {
        const container = $('#report-table-container');
        if (data.length === 0) { container.html('<p class="text-muted text-center">No records found.</p>'); return; }
        const table = $('<table class="table table-hover table-sm"></table>');
        table.html(`<thead class="thead-light"><tr><th>Date</th><th>Patient</th><th>Village</th><th>Program</th><th>Caste</th><th>BP</th><th>RBS</th></tr></thead><tbody></tbody>`);
        const tbody = table.find('tbody');
        data.forEach(row => {
            tbody.append(`<tr><td>${new Date(row.follow_up_date).toLocaleDateString()}</td><td>${row.patient_name}</td><td>${row.village_name}</td><td>${row.program_type}</td><td>${row.caste}</td><td>${row.blood_pressure || 'N/A'}</td><td>${row.random_blood_sugar || 'N/A'}</td></tr>`);
        });
        container.html(table);
    }
    
    $('#export-excel-btn').on('click', function() {
        const exportUrl = new URL(`${apiBaseUrl}/api/export`);
        const selectedVillages = $('#filter-village-checkboxes :checked').map((_, el) => $(el).val()).get();
        const selectedPrograms = $('#filter-program-checkboxes :checked').map((_, el) => $(el).val()).get();
        const selectedCastes = $('#filter-caste-checkboxes :checked').map((_, el) => $(el).val()).get();
        const params = {
            startDate: $('#filter-start-date').val(), endDate: $('#filter-end-date').val(),
            villages: selectedVillages.join(','), programs: selectedPrograms.join(','), castes: selectedCastes.join(',')
        };
        Object.keys(params).forEach(key => { if(params[key]) exportUrl.searchParams.set(key, params[key]) });
        window.location.href = exportUrl.toString();
    });

    // --- Village Summary Report Logic ---
    $('#generate-summary-btn').on('click', function() {
        const summaryUrl = new URL(`${apiBaseUrl}/api/summary-report`);
        const params = { startDate: $('#summary-start-date').val(), endDate: $('#summary-end-date').val() };
        Object.keys(params).forEach(key => { if(params[key]) summaryUrl.searchParams.set(key, params[key]) });
        $('#summary-table-container').html('<p class="text-muted text-center">Generating summary...</p>');
        $('#export-summary-btn').prop('disabled', true);
        $.get(summaryUrl.toString(), function(data) {
            renderSummaryTable(data);
            if(data.length > 0) $('#export-summary-btn').prop('disabled', false);
        }).fail(() => $('#summary-table-container').html('<p class="text-danger text-center">Failed to generate summary.</p>'));
    });

    function renderSummaryTable(data) {
        const container = $('#summary-table-container');
        if (data.length === 0) { container.html('<p class="text-muted text-center">No data found for this period.</p>'); return; }
        const table = $('<table class="table table-hover table-sm"></table>');
        table.html(`<thead class="thead-light"><tr><th>Village</th><th>Patient Count</th><th>Avg. BP</th><th>Avg. Heartbeat</th><th>Medicines Given</th></tr></thead><tbody></tbody>`);
        const tbody = table.find('tbody');
        data.forEach(row => {
            const avgBP = (row.avg_systolic && row.avg_diastolic) ? `${Math.round(row.avg_systolic)} / ${Math.round(row.avg_diastolic)}` : 'N/A';
            const avgHeartbeat = row.avg_heartbeat ? Math.round(row.avg_heartbeat) : 'N/A';
            tbody.append(`<tr><td>${row.village_name}</td><td>${row.patient_count}</td><td>${avgBP}</td><td>${avgHeartbeat}</td><td class="small">${row.medicines_given || 'None'}</td></tr>`);
        });
        container.html(table);
    }
    
    $('#export-summary-btn').on('click', function() {
        const exportUrl = new URL(`${apiBaseUrl}/api/summary-report/export`);
        const params = { startDate: $('#summary-start-date').val(), endDate: $('#summary-end-date').val() };
        Object.keys(params).forEach(key => { if(params[key]) exportUrl.searchParams.set(key, params[key]) });
        window.location.href = exportUrl.toString();
    });

    // --- Medicine Inventory Logic ---
    function fetchMedicines() {
        $('#medicine-table-container').html('<p class="text-muted text-center">Loading...</p>');
        $.get(`${apiBaseUrl}/api/medicines`, function(medicines) { renderMedicineTable(medicines); })
         .fail(() => $('#medicine-table-container').html('<p class="text-danger text-center">Failed to load inventory.</p>'));
    }

    function renderMedicineTable(medicines) {
        const container = $('#medicine-table-container');
        if (medicines.length === 0) { container.html('<p class="text-muted text-center">No medicines in inventory.</p>'); return; }
        const table = $('<table class="table table-hover table-sm"></table>');
        table.html(`<thead class="thead-light"><tr><th>Name</th><th>Stock</th><th>Expiry</th><th>Actions</th></tr></thead><tbody></tbody>`);
        const tbody = table.find('tbody');
        const today = new Date(); today.setHours(0, 0, 0, 0);
        medicines.forEach(med => {
            const expiryDate = new Date(med.expiration_date);
            let rowClass = (expiryDate < today) ? 'table-danger' : (med.stock_count <= 10 ? 'table-warning' : '');
            tbody.append(`<tr class="${rowClass}" data-id="${med.id}" data-name="${med.name}" data-stock="${med.stock_count}"><td>${med.name}</td><td>${med.stock_count}</td><td>${med.expiration_date}</td><td><button class="btn btn-sm btn-info update-stock-btn" title="Update"><i class="fas fa-edit"></i></button> <button class="btn btn-sm btn-danger delete-med-btn" title="Delete"><i class="fas fa-trash"></i></button></td></tr>`);
        });
        container.html(table);
    }

    $('#add-medicine-form').on('submit', function(e) {
        e.preventDefault();
        const newMedicine = { name: $('#med-name').val(), stock_count: $('#med-stock').val(), expiration_date: $('#med-expiry').val() };
        $.ajax({
            url: `${apiBaseUrl}/api/medicines`, type: 'POST', contentType: 'application/json', data: JSON.stringify(newMedicine),
            success: () => { $('#add-medicine-form')[0].reset(); fetchMedicines(); },
            error: () => alert('Error adding medicine.')
        });
    });

    $('#export-medicine-btn').on('click', function() {
        window.location.href = `${apiBaseUrl}/api/medicines/export`;
    });

    $('#medicine-table-container').on('click', '.delete-med-btn', function() {
        const medId = $(this).closest('tr').data('id');
        if (confirm(`Delete ${$(this).closest('tr').data('name')}?`)) {
            $.ajax({ url: `${apiBaseUrl}/api/medicines/${medId}`, type: 'DELETE', success: () => fetchMedicines() });
        }
    });

    $('#medicine-table-container').on('click', '.update-stock-btn', function() {
        const tr = $(this).closest('tr');
        const newStock = prompt(`Enter new stock for ${tr.data('name')}:`, tr.data('stock'));
        if (newStock !== null && !isNaN(newStock) && newStock >= 0) {
            $.ajax({
                url: `${apiBaseUrl}/api/medicines/${tr.data('id')}`, type: 'PUT', contentType: 'application/json', data: JSON.stringify({ stock_count: newStock }),
                success: () => fetchMedicines()
            });
        }
    });

    // --- Patient Records Page Logic ---
    function fetchPatientRecords() {
        $('#records-table-container').html('<p class="text-muted text-center">Loading records...</p>');
        $.get(`${apiBaseUrl}/api/patient-records`, function(records) {
            renderRecordsTable(records);
        }).fail(() => {
            $('#records-table-container').html('<p class="text-danger text-center">Failed to load patient records.</p>');
        });
    }

    function renderRecordsTable(records) {
        const container = $('#records-table-container');
        if (records.length === 0) {
            container.html('<p class="text-muted text-center">No patients have been registered yet.</p>');
            return;
        }
        const table = $('<table class="table table-hover table-sm"></table>');
        table.html(`
            <thead class="thead-light">
                <tr>
                    <th>Patient Name</th>
                    <th>Village</th>
                    <th>Registration Date</th>
                    <th>Last Follow-up Date</th>
                </tr>
            </thead>
            <tbody></tbody>`);
        const tbody = table.find('tbody');
        records.forEach(row => {
            tbody.append(`
                <tr>
                    <td>${row.name}</td>
                    <td>${row.village_name || 'N/A'}</td>
                    <td>${row.registration_date}</td>
                    <td>${row.last_follow_up || 'None'}</td>
                </tr>
            `);
        });
        container.html(table);
    }

    $('#export-records-btn').on('click', function() {
        window.location.href = `${apiBaseUrl}/api/patient-records/export`;
    });
    
    // --- Demographics Page Logic ---
    function fetchDemographicsReport() {
        $('#demographics-table-container').html('<p class="text-muted text-center">Loading report...</p>');
        $.get(`${apiBaseUrl}/api/demographics-report`, function(data) {
            renderDemographicsTable(data);
        }).fail(() => {
            $('#demographics-table-container').html('<p class="text-danger text-center">Failed to load demographics report.</p>');
        });
    }

    function renderDemographicsTable(data) {
        const container = $('#demographics-table-container');
        if (data.length === 0) {
            container.html('<p class="text-muted text-center">No patient data available to generate report.</p>');
            return;
        }
        const table = $('<table class="table table-hover table-sm"></table>');
        table.html(`
            <thead class="thead-light">
                <tr>
                    <th>Village Name</th>
                    <th>Total Patients</th>
                    <th>General</th>
                    <th>SC/ST</th>
                    <th>Others</th>
                </tr>
            </thead>
            <tbody></tbody>`);
        const tbody = table.find('tbody');
        data.forEach(row => {
            tbody.append(`
                <tr>
                    <td><strong>${row.village_name}</strong></td>
                    <td>${row.total_patients}</td>
                    <td>${row.general_count}</td>
                    <td>${row.sc_st_count}</td>
                    <td>${row.others_count}</td>
                </tr>
            `);
        });
        container.html(table);
    }

    $('#export-demographics-btn').on('click', function() {
        window.location.href = `${apiBaseUrl}/api/demographics-report/export`;
    });

    // --- Lab Page Logic ---
    function fetchLabRecords() {
        $('#lab-table-container').html('<p class="text-muted text-center">Loading lab records...</p>');
        $.get(`${apiBaseUrl}/api/lab-records`, function(records) {
            renderLabTable(records);
        }).fail(() => {
            $('#lab-table-container').html('<p class="text-danger text-center">Failed to load lab records.</p>');
        });
    }

    function renderLabTable(records) {
        const container = $('#lab-table-container');
        if (records.length === 0) { container.html('<p class="text-muted text-center">No lab records found.</p>'); return; }
        const table = $('<table class="table table-hover table-sm"></table>');
        table.html(`<thead class="thead-light"><tr><th>Date</th><th>Patient</th><th>Father/Husband</th><th>Sex</th><th>Test</th><th>Positive</th><th>Negative</th></tr></thead><tbody></tbody>`);
        const tbody = table.find('tbody');
        records.forEach(row => {
            tbody.append(`<tr><td>${row.test_date}</td><td>${row.patient_name}</td><td>${row.husband_father_name || ''}</td><td>${row.sex || ''}</td><td>${row.test_name}</td><td>${row.result_positive_reading || ''}</td><td>${row.result_negative_reading || ''}</td></tr>`);
        });
        container.html(table);
    }
    
    $('#lab-patient-id').on('change', function() {
        const patientId = $(this).val();
        const detailsContainer = $('#lab-patient-details');
        if (patientId) {
            $.get(`${apiBaseUrl}/api/patients/${patientId}`, function(patient) {
                detailsContainer.html(`<small class="text-muted"><strong>Father/Husband:</strong> ${patient.husband_father_name || 'N/A'} | <strong>Age:</strong> ${patient.age || 'N/A'} | <strong>Sex:</strong> ${patient.sex || 'N/A'} | <strong>Village:</strong> ${patient.village_name || 'N/A'}</small>`).removeClass('d-none');
            });
        } else {
            detailsContainer.addClass('d-none');
        }
    });

    $('#add-lab-record-form').on('submit', function(e) {
        e.preventDefault();
        const labData = {
            patient_id: $('#lab-patient-id').val(),
            test_date: $('#lab-test-date').val(),
            test_name: $('#lab-test-name').val(),
            result_positive_reading: $('#lab-positive-reading').val() || null,
            result_negative_reading: $('#lab-negative-reading').val() || null
        };
        if (!labData.patient_id || !labData.test_date) {
            alert('Please select a patient and test date.');
            return;
        }
        $.ajax({
            url: `${apiBaseUrl}/api/lab-records`, type: 'POST', contentType: 'application/json', data: JSON.stringify(labData),
            success: () => {
                alert('Lab record saved!');
                $('#add-lab-record-form')[0].reset();
                $('#lab-patient-details').addClass('d-none');
                fetchLabRecords();
            },
            error: () => alert('Error saving lab record.')
        });
    });
    
    $('#export-lab-btn').on('click', function() {
        window.location.href = `${apiBaseUrl}/api/lab-records/export`;
    });

    // --- Logbook Page Logic ---
    function fetchLogbookEntries() {
        $('#logbook-table-container').html('<p class="text-muted text-center">Loading logbook...</p>');
        $.get(`${apiBaseUrl}/api/logbook`, function(entries) {
            renderLogbookTable(entries);
        }).fail(() => {
            $('#logbook-table-container').html('<p class="text-danger text-center">Failed to load logbook.</p>');
        });
    }

    function renderLogbookTable(entries) {
        const container = $('#logbook-table-container');
        if (entries.length === 0) { container.html('<p class="text-muted text-center">No logbook entries found.</p>'); return; }
        const table = $('<table class="table table-hover table-sm"></table>');
        table.html(`<thead class="thead-light"><tr><th>Date</th><th>Time In</th><th>Time Out</th><th>Opening KMs</th><th>Closing KMs</th><th>Total KMs</th><th>Fuel (L)</th><th>Villages</th></tr></thead><tbody></tbody>`);
        const tbody = table.find('tbody');
        entries.forEach(row => {
            tbody.append(`<tr><td>${row.entry_date}</td><td>${row.time_in || ''}</td><td>${row.time_out || ''}</td><td>${row.kms_opening || ''}</td><td>${row.kms_closing || ''}</td><td>${row.total_kms || ''}</td><td>${row.fuel_quantity || ''}</td><td>${row.villages_visited || ''}</td></tr>`);
        });
        container.html(table);
    }

    $('#log-kms-opening, #log-kms-closing').on('input', function() {
        const opening = parseFloat($('#log-kms-opening').val());
        const closing = parseFloat($('#log-kms-closing').val());
        if (!isNaN(opening) && !isNaN(closing) && closing >= opening) {
            $('#log-total-kms').val((closing - opening).toFixed(2));
        } else {
            $('#log-total-kms').val('');
        }
    });

    $('#add-logbook-form').on('submit', function(e) {
        e.preventDefault();
        const logData = {
            entry_date: $('#log-date').val(),
            time_in: $('#log-time-in').val() || null,
            time_out: $('#log-time-out').val() || null,
            kms_opening: $('#log-kms-opening').val() || null,
            kms_closing: $('#log-kms-closing').val() || null,
            total_kms: $('#log-total-kms').val() || null,
            fuel_quantity: $('#log-fuel').val() || null,
            villages_visited: $('#log-villages').val() || null,
        };
        if (!logData.entry_date) { alert('Please enter a date for the log entry.'); return; }
        $.ajax({
            url: `${apiBaseUrl}/api/logbook`, type: 'POST', contentType: 'application/json', data: JSON.stringify(logData),
            success: () => {
                alert('Log entry saved!');
                $('#add-logbook-form')[0].reset();
                fetchLogbookEntries();
            },
            error: () => alert('Error saving log entry.')
        });
    });

    $('#export-logbook-btn').on('click', function() {
        window.location.href = `${apiBaseUrl}/api/logbook/export`;
    });


    // --- Cumulative Report Page Logic ---
    function populateYearSelect() {
        const yearSelect = $('#cumulative-year-select');
        const currentYear = new Date().getFullYear();
        for (let i = currentYear; i >= 2020; i--) {
            yearSelect.append(`<option value="${i}">${i}</option>`);
        }
    }

    function fetchCumulativeReport() {
        const year = $('#cumulative-year-select').val();
        if (!year) return;

        $('#cumulative-table-container').html('<p class="text-muted text-center">Loading report...</p>');
        $.get(`${apiBaseUrl}/api/cumulative-report?year=${year}`, function(data) {
            renderCumulativeTable(data);
        }).fail(() => {
            $('#cumulative-table-container').html('<p class="text-danger text-center">Failed to load report.</p>');
        });
    }

    function renderCumulativeTable(data) {
        const container = $('#cumulative-table-container');
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        
        const parameters = [
            { key: 'VILLAGE VISITED', label: 'VILLAGE VISITED' },
            { key: 'NO OF PATIENTS REGISTERED', label: 'NO OF PATIENTS REGISTERED' },
            { key: 'NO OF FEMALE PATIENTS', label: 'NO OF FEMALE PATIENTS' },
            { key: 'NO OF INFANTS <Below 5 year>', label: 'NO OF INFANTS <Below 5 year>' },
            { key: 'GEN_COUNT', label: 'NO OF GEN PATIENTS' },
            { key: 'SC_ST_COUNT', label: 'NO OF SC/ST PATIENTS' },
            { key: 'OTHERS_COUNT', label: 'NO OF OTHERS PATIENTS' },
            { key: 'DIAGNOSTIC_SERVICES_AVAILED', label: 'NO OF PATIENTS WHO AVAILED ANY OF THE DIAGNOSTIC SERVICES' },
            { key: 'ANC_SERVICES', label: 'NO OF WOMEN WHO AVAILED ANC SERVICES' },
            { key: 'ANC_GEN', label: 'NO OF GEN WOMEN WHO AVAILED ANC' },
            { key: 'ANC_SC_ST', label: 'NO OF SC/ST WOMEN WHO AVAILED ANC' },
            { key: 'ANC_OTHERS', label: 'NO OF OTHERS WOMEN WHO AVAILED ANC' },
            { key: 'ANC_DIAGNOSTIC_SERVICES', label: 'NO OF WOMEN FOR ANC CHECKUPS WHO AVAILED DIAGNOSTIC SERVICES' },
            { key: 'PNC_SERVICES', label: 'NO OF WOMEN WHO RECEIVED PNC SERVICES' },
            { key: 'FEVER', label: 'NO OF PATIENTS WITH FEVER' },
            { key: 'DIARRHEA', label: 'NO OF PATIENTS WITH DIARRHEA' },
            { key: 'UPPER_RESPIRATORY_INFECTION', label: 'NO OF PATIENTS WITH UPPER RESPIRATORY INFECTION' },
            { key: 'WORM_INFESTATION', label: 'NO OF PATIENTS WITH WORM INFESTATION' },
            { key: 'ANEMIA', label: 'NO OF PATIENTS WITH ANEMIA (Hb < 11)' },
            { key: 'CATARACT', label: 'NO OF PATIENTS WITH EYE CATARACT' },
            { key: 'EYE_INFECTION_INJURY', label: 'NO OF PATIENTS WITH EYE INFECTION / INJURY' },
            { key: 'EAR_DISCHARGE', label: 'NO OF PATIENTS WITH EAR DISCHARGE' },
            { key: 'DENTAL_GUM_DISEASES', label: 'NO OF PATIENTS WITH DENTAL AND GUM DISEASES' },
            { key: 'SKIN_DISEASES', label: 'NO OF PATIENTS WITH SKIN DISEASES' }
        ];

        const table = $('<table class="table table-bordered table-sm text-center"></table>');
        let header = `<thead class="thead-light"><tr><th style="width: 40%;">Reporting Parameters</th>${months.map(m => `<th>${m}</th>`).join('')}<th>Total</th></tr></thead>`;
        table.append(header);

        const tbody = $('<tbody></tbody>');
        parameters.forEach(p => {
            let rowHtml = `<tr><td class="text-left">${p.label}</td>`;
            const paramData = data[p.key] || {};
            months.forEach((_, index) => {
                const monthKey = String(index + 1).padStart(2, '0');
                rowHtml += `<td>${paramData[monthKey] || 0}</td>`;
            });
            rowHtml += `<td><strong>${paramData.total || 0}</strong></td></tr>`;
            tbody.append(rowHtml);
        });
        table.append(tbody);
        container.html(table);
    }
    
    $('#cumulative-year-select').on('change', fetchCumulativeReport);

    $('#export-cumulative-btn').on('click', function() {
        const year = $('#cumulative-year-select').val();
        window.location.href = `${apiBaseUrl}/api/cumulative-report/export?year=${year}`;
    });

    // --- Initial Page Load ---
    populateVillageFilter();
    populateProgramAndCasteFilters();
    populateAllPatientDropdowns();
    fetchMedicines();
    populateYearSelect();
    
    // Set the default page to dashboard and load its data
    $('#nav-dashboard').trigger('click');
});