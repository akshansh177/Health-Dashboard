$(document).ready(function() {
    const apiBaseUrl = 'http://100.88.78.68:3000'; 

    // --- Page Navigation Logic ---
    function showPage(pageId) {
        $('#page-dashboard, #page-records, #page-demographics, #page-lab, #page-reports, #page-logbook, #page-medicine, #page-activity-log').addClass('d-none');
        $(`#${pageId}`).removeClass('d-none');
    }

    function fetchDashboardStats() {
        $.get(`${apiBaseUrl}/api/dashboard-stats`, function(data) {
            $('#stat-total-patients').text(data.totalPatients);
            $('#stat-visits-month').text(data.visitsThisMonth);
            $('#stat-low-stock').text(data.lowStockItems);
        }).fail(() => {
            console.error("Failed to load dashboard stats.");
        });
    }

    $('#nav-dashboard').on('click', function(e) { e.preventDefault(); $('.nav-link').removeClass('active'); $(this).addClass('active'); showPage('page-dashboard'); fetchDashboardStats(); });
    $('#nav-records').on('click', function(e) { e.preventDefault(); $('.nav-link').removeClass('active'); $(this).addClass('active'); showPage('page-records'); fetchPatientRecords(); });
    $('#nav-demographics').on('click', function(e) { e.preventDefault(); $('.nav-link').removeClass('active'); $(this).addClass('active'); showPage('page-demographics'); fetchDemographicsReport(); });
    $('#nav-lab').on('click', function(e) { e.preventDefault(); $('.nav-link').removeClass('active'); $(this).addClass('active'); showPage('page-lab'); fetchLabRecords(); });
    $('#nav-logbook').on('click', function(e) { e.preventDefault(); $('.nav-link').removeClass('active'); $(this).addClass('active'); showPage('page-logbook'); fetchLogbookEntries(); });
    $('#nav-medicine').on('click', function(e) { e.preventDefault(); $('.nav-link').removeClass('active'); $(this).addClass('active'); showPage('page-medicine'); fetchMedicines(); });
    $('#nav-reports').on('click', function(e) { e.preventDefault(); $('.nav-link').removeClass('active'); $(this).addClass('active'); showPage('page-reports'); fetchCumulativeReport(); });
    $('#nav-activity-log').on('click', function(e) { e.preventDefault(); $('.nav-link').removeClass('active'); $(this).addClass('active'); showPage('page-activity-log'); fetchActivityLog(); });


    // --- Patient Registration Logic ---
    $('#program_type').on('change', function() {
        const selectedProgram = $(this).val();
        $('#anc-details-container').addClass('d-none');
        $('#pnc-details-container').addClass('d-none');

        if (selectedProgram === 'ANC') {
            $('#anc-details-container').removeClass('d-none');
        } else if (selectedProgram === 'PNC') {
            $('#pnc-details-container').removeClass('d-none');
        }
    });

    $('#add-patient-form').on('submit', function(e) {
        e.preventDefault();
        const programType = $('#program_type').val();
        
        const newPatient = {
            registration_date: $('#registration_date').val(),
            name: $('#name').val(),
            husband_father_name: $('#husband_father_name').val(), 
            age: $('#age').val(),
            sex: $('#sex').val(),
            village_name: $('#village_name').val(), 
            program_type: programType,
            caste: $('#caste').val(),
            bpl_status: $('#bpl_status').val()
        };

        if (programType === 'ANC') {
            newPatient.anc_details = { gpal: $('#anc_gpal').val(), albumin: $('#anc_albumin').val(), tt: $('#anc_tt').val(), fhr: $('#anc_fhr').val(), gestational_age: $('#anc_gestational_age').val(), fp: $('#anc_fp').val(), contact: $('#anc_contact').val(), remark: $('#anc_remark').val() };
        } else if (programType === 'PNC') {
            newPatient.pnc_details = { pnc_duration: $('#pnc_duration').val(), mother_weight: $('#pnc_mother_weight').val(), child_weight: $('#pnc_child_weight').val() };
        }

        if (!newPatient.registration_date) { alert('Date of Visit is required.'); return; }
        if (!newPatient.village_name.trim()) { alert('Village name is required.'); return; }

        $.ajax({
            url: `${apiBaseUrl}/api/patients`, type: 'POST', contentType: 'application/json', data: JSON.stringify(newPatient),
            success: function(response) {
                alert('Patient added successfully!');
                const addFollowUp = $('#add-follow-up-checkbox').is(':checked');
                
                $('#add-patient-form')[0].reset();
                $('#anc-details-container').addClass('d-none');
                $('#pnc-details-container').addClass('d-none');
                populateVillageFilter(); 
                
                const newOption = `<option value="${response.id}">${response.name}</option>`;
                $('#fu-patient-id').append(newOption);
                $('#lab-patient-id').append(newOption);

                if (addFollowUp) {
                    $('#fu-patient-id').val(response.id);
                    $('html, body').animate({ scrollTop: $("#add-follow-up-form").offset().top }, 500);
                }
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
            blood_pressure: $('#fu-blood_pressure').val() || null, weight_kg: $('#fu-weight').val() || null, height_cm: $('#fu-height').val() || null,
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
            success: () => { 
                alert('Follow-up saved and medicine issued!'); 
                $('#add-follow-up-form')[0].reset(); 
                $('#fu-prescription-list').empty();
                $('#fu-medicine').val('');
                fetchMedicines(); 
            },
            error: (xhr) => alert('Error saving follow-up: ' + xhr.responseText)
        });
    });

    // --- Patient Records Page & Details Modal Logic ---
    function fetchPatientRecords() {
        $('#records-table-container').html('<p class="text-muted text-center">Loading records...</p>');
        
        const searchTerm = $('#records-search-input').val();
        const startDate = $('#records-start-date').val();
        const endDate = $('#records-end-date').val();

        const params = new URLSearchParams();
        if (searchTerm) params.append('searchTerm', searchTerm);
        if (startDate) params.append('startDate', startDate);
        if (endDate) params.append('endDate', endDate);

        $.get(`${apiBaseUrl}/api/patient-records?${params.toString()}`, function(records) {
            renderRecordsTable(records);
        }).fail(() => {
            $('#records-table-container').html('<p class="text-danger text-center">Failed to load patient records.</p>');
        });
    }

    $('#records-filter-btn').on('click', fetchPatientRecords);

    function renderRecordsTable(records) {
        const container = $('#records-table-container');
        if (records.length === 0) {
            container.html('<p class="text-muted text-center">No patients found.</p>');
            return;
        }
        const table = $('<table class="table table-hover table-sm"></table>');
        table.html(`<thead class="thead-light"><tr><th>Patient Name</th><th>Village</th><th>Reg. Date</th><th>Last Follow-up</th><th>Actions</th></tr></thead><tbody></tbody>`);
        const tbody = table.find('tbody');
        records.forEach(row => {
            tbody.append(`
                <tr data-patient-id="${row.id}">
                    <td><a href="#" class="patient-details-link" data-patient-id="${row.id}">${row.name}</a></td>
                    <td>${row.village_name || 'N/A'}</td>
                    <td>${row.registration_date}</td>
                    <td>${row.last_follow_up || 'None'}</td>
                    <td>
                        <button class="btn btn-sm btn-info edit-patient-btn" title="Edit"><i class="fas fa-edit"></i></button>
                        <button class="btn btn-sm btn-danger delete-patient-btn" title="Delete"><i class="fas fa-trash"></i></button>
                    </td>
                </tr>`);
        });
        container.html(table);
    }

    $('#records-table-container').on('click', '.patient-details-link', function(e) {
        e.preventDefault();
        const patientId = $(this).data('patient-id');
        fetchAndShowPatientDetails(patientId);
    });

    function fetchAndShowPatientDetails(patientId) {
        const modalBody = $('#patient-details-modal .modal-body');
        modalBody.html('<p class="text-center">Loading details...</p>');
        $('#patient-details-modal').data('patient-id', patientId); // Store patient ID on the modal
        $('#patient-details-modal').modal('show');

        $.get(`${apiBaseUrl}/api/patient-details/${patientId}`, function(data) {
            displayPatientDetails(data);
        }).fail(() => {
            modalBody.html('<p class="text-center text-danger">Could not load patient details.</p>');
        });
    }
    
    function displayPatientDetails(data) {
        const { details, follow_ups, anc_details, pnc_details } = data;
        
        // Cache follow-ups data on the modal for later access
        $('#patient-details-modal').data('follow-ups', follow_ups);
        
        $('#patientDetailsModalLabel').text(`Details for ${details.name}`);

        let content = `
            <h5>Patient Information</h5>
            <div class="row">
                <div class="col-md-6">
                    <p><strong>Name:</strong> ${details.name}</p>
                    <p><strong>Age:</strong> ${details.age || 'N/A'}</p>
                    <p><strong>Sex:</strong> ${details.sex || 'N/A'}</p>
                    <p><strong>Caste:</strong> ${details.caste || 'N/A'}</p>
                </div>
                <div class="col-md-6">
                    <p><strong>Husband/Father:</strong> ${details.husband_father_name || 'N/A'}</p>
                    <p><strong>Village:</strong> ${details.village_name || 'N/A'}</p>
                    <p><strong>Program:</strong> ${details.program_type || 'N/A'}</p>
                    <p><strong>BPL Status:</strong> ${details.bpl_status || 'No'}</p>
                </div>
            </div>
            <hr>`;

        if (details.program_type === 'ANC' && anc_details) {
            content += `
                <h5>ANC Program Details</h5>
                <div class="row">
                    <div class="col-md-6">
                        <p><strong>GPAL:</strong> ${anc_details.gpal || 'N/A'}</p>
                        <p><strong>Albumin:</strong> ${anc_details.albumin || 'N/A'}</p>
                        <p><strong>TT:</strong> ${anc_details.tt || 'N/A'}</p>
                        <p><strong>FHR:</strong> ${anc_details.fhr || 'N/A'}</p>
                    </div>
                    <div class="col-md-6">
                        <p><strong>Gestational Age:</strong> ${anc_details.gestational_age || 'N/A'}</p>
                        <p><strong>FP:</strong> ${anc_details.fp || 'N/A'}</p>
                        <p><strong>Contact:</strong> ${anc_details.contact || 'N/A'}</p>
                        <p><strong>Remark:</strong> ${anc_details.remark || 'N/A'}</p>
                    </div>
                </div>
                <hr>`;
        }

        if (details.program_type === 'PNC' && pnc_details) {
            content += `
                <h5>PNC Program Details</h5>
                <div class="row">
                    <div class="col-md-4"><p><strong>PNC Duration:</strong> ${pnc_details.pnc_duration || 'N/A'}</p></div>
                    <div class="col-md-4"><p><strong>Mother Weight:</strong> ${pnc_details.mother_weight || 'N/A'} Kg</p></div>
                    <div class="col-md-4"><p><strong>Child Weight:</strong> ${pnc_details.child_weight || 'N/A'} Kg</p></div>
                </div>
                <hr>`;
        }
        
        content += `<h5>Follow-up History</h5>`;
        if (follow_ups.length > 0) {
            content += `<div class="table-responsive" style="max-height: 300px;">
                <table class="table table-sm table-bordered">
                    <thead class="thead-light"><tr><th>Date</th><th>BP</th><th>Complaint</th><th>Medicine</th><th>Actions</th></tr></thead>
                    <tbody>`;
            follow_ups.forEach(fu => {
                content += `<tr data-follow-up-id="${fu.id}">
                    <td>${new Date(fu.follow_up_date).toLocaleDateString()}</td>
                    <td>${fu.blood_pressure || 'N/A'}</td>
                    <td>${fu.complaint_of || 'N/A'}</td>
                    <td>${fu.medicine_prescribed || 'N/A'}</td>
                    <td>
                        <button class="btn btn-sm btn-primary view-follow-up-btn mr-1" title="View Full Record"><i class="fas fa-eye"></i></button>
                        <button class="btn btn-sm btn-info edit-follow-up-btn" title="Edit Record"><i class="fas fa-edit"></i></button>
                    </td>
                </tr>`;
            });
            content += `</tbody></table></div>`;
        } else {
            content += '<p>No follow-up records found.</p>';
        }

        $('#patient-details-modal .modal-body').html(content);
    }
    
    // --- Edit and Delete Patient Logic ---
    $('#records-table-container').on('click', '.edit-patient-btn', function() {
        const patientId = $(this).closest('tr').data('patient-id');
        openEditModal(patientId);
    });

    function openEditModal(patientId) {
        $.get(`${apiBaseUrl}/api/patient-details/${patientId}`, function(data) {
            const { details, anc_details, pnc_details } = data;
            $('#edit-patient-id').val(details.id);
            $('#edit-registration-date').val(details.registration_date);
            $('#edit-name').val(details.name);
            $('#edit-husband-father-name').val(details.husband_father_name);
            $('#edit-age').val(details.age);
            $('#edit-sex').val(details.sex);
            $('#edit-caste').val(details.caste);
            $('#edit-bpl-status').val(details.bpl_status);
            $('#edit-village-name').val(details.village_name);
            $('#edit-program-type').val(details.program_type).trigger('change'); 

            if (details.program_type === 'ANC' && anc_details) {
                $('#edit-anc-gpal').val(anc_details.gpal);
                $('#edit-anc-albumin').val(anc_details.albumin);
                $('#edit-anc-tt').val(anc_details.tt);
                $('#edit-anc-fhr').val(anc_details.fhr);
                $('#edit-anc-gestational-age').val(anc_details.gestational_age);
                $('#edit-anc-fp').val(anc_details.fp);
                $('#edit-anc-contact').val(anc_details.contact);
                $('#edit-anc-remark').val(anc_details.remark);
            }
            
            if (details.program_type === 'PNC' && pnc_details) {
                $('#edit-pnc-duration').val(pnc_details.pnc_duration);
                $('#edit-pnc-mother-weight').val(pnc_details.mother_weight);
                $('#edit-pnc-child-weight').val(pnc_details.child_weight);
            }

            $('#edit-patient-modal').modal('show');
        });
    }
    
    $('#edit-program-type').on('change', function() {
        const selectedProgram = $(this).val();
        $('#edit-anc-details-container').addClass('d-none');
        $('#edit-pnc-details-container').addClass('d-none');

        if (selectedProgram === 'ANC') {
            $('#edit-anc-details-container').removeClass('d-none');
        } else if (selectedProgram === 'PNC') {
            $('#edit-pnc-details-container').removeClass('d-none');
        }
    });


    $('#edit-patient-form').on('submit', function(e) {
        e.preventDefault();
        const patientId = $('#edit-patient-id').val();
        const programType = $('#edit-program-type').val();

        const updatedData = {
            registration_date: $('#edit-registration-date').val(),
            name: $('#edit-name').val(),
            husband_father_name: $('#edit-husband-father-name').val(),
            age: $('#edit-age').val(),
            sex: $('#edit-sex').val(),
            caste: $('#edit-caste').val(),
            bpl_status: $('#edit-bpl-status').val(),
            village_name: $('#edit-village-name').val(),
            program_type: programType
        };

        if (programType === 'ANC') {
            updatedData.anc_details = {
                gpal: $('#edit-anc-gpal').val(), albumin: $('#edit-anc-albumin').val(), tt: $('#edit-anc-tt').val(), fhr: $('#edit-anc-fhr').val(),
                gestational_age: $('#edit-anc-gestational-age').val(), fp: $('#edit-anc-fp').val(), contact: $('#edit-anc-contact').val(), remark: $('#edit-anc-remark').val()
            };
        } else if (programType === 'PNC') {
            updatedData.pnc_details = {
                pnc_duration: $('#edit-pnc-duration').val(), mother_weight: $('#edit-pnc-mother-weight').val(), child_weight: $('#edit-pnc-child-weight').val()
            };
        }


        $.ajax({
            url: `${apiBaseUrl}/api/patients/${patientId}`,
            type: 'PUT',
            contentType: 'application/json',
            data: JSON.stringify(updatedData),
            success: function() {
                alert('Patient details updated successfully!');
                $('#edit-patient-modal').modal('hide');
                fetchPatientRecords(); 
            },
            error: function() {
                alert('Error: Could not update patient details.');
            }
        });
    });
    
    $('#records-table-container').on('click', '.delete-patient-btn', function() {
        const patientId = $(this).closest('tr').data('patient-id');
        const patientName = $(this).closest('tr').find('.patient-details-link').text();
        if (confirm(`Are you sure you want to delete ${patientName}? This action cannot be undone.`)) {
            $.ajax({
                url: `${apiBaseUrl}/api/patients/${patientId}`,
                type: 'DELETE',
                success: function() {
                    alert('Patient deleted successfully.');
                    fetchPatientRecords(); 
                },
                error: function() {
                    alert('Error: Could not delete patient.');
                }
            });
        }
    });
    
    // --- View/Edit Follow-up ---
    $('#patient-details-modal').on('click', '.edit-follow-up-btn', function() {
        const followUpId = $(this).closest('tr').data('follow-up-id');
        const patientId = $('#patient-details-modal').data('patient-id');
        openEditFollowUpModal(followUpId, patientId);
    });

    function openEditFollowUpModal(followUpId, patientId) {
        $.get(`${apiBaseUrl}/api/followups/${followUpId}`, function(data) {
            // Populate the modal form
            $('#edit-fu-id').val(data.id);
            $('#edit-fu-patient-id').val(patientId); // Store patientId for refresh
            $('#edit-fu-date').val(data.follow_up_date);
            $('#edit-fu-pulse').val(data.pulse);
            $('#edit-fu-respiratory-rate').val(data.respiratory_rate);
            $('#edit-fu-temperature').val(data.temperature);
            $('#edit-fu-blood-pressure').val(data.blood_pressure);
            $('#edit-fu-weight').val(data.weight_kg);
            $('#edit-fu-height').val(data.height_cm);
            $('#edit-fu-kco').val(data.known_case_of);
            $('#edit-fu-ho').val(data.history_of);
            $('#edit-fu-co').val(data.complaint_of);
            $('#edit-fu-oe').val(data.on_examination);
            $('#edit-fu-treatment').val(data.treatment_advised);
            //$('#edit-fu-medicine').val(data.medicine_prescribed);
            renderPrescriptionList(data.medicine_prescribed, '#edit-fu-prescription-list', '#edit-fu-medicine');
            $('#edit-fu-follow-up-notes').val(data.follow_up_notes);
            $('#edit-fu-lmp').val(data.last_menstrual_period);
            $('#edit-fu-edd').val(data.expected_delivery_date);
            $('#edit-fu-heartbeat').val(data.heartbeat);
            $('#edit-fu-rbs').val(data.random_blood_sugar);
            $('#edit-fu-hb').val(data.haemoglobin);
            $('#edit-fu-urine-sugar').val(data.urine_sugar);
            $('#edit-fu-urine-albumin').val(data.urine_albumin);
    
            $('#edit-follow-up-modal').modal('show');
        }).fail(function() {
            alert('Error: Could not retrieve follow-up details.');
        });
    }
    
    $('#edit-follow-up-form').on('submit', function(e) {
        e.preventDefault();
        const followUpId = $('#edit-fu-id').val();
        const patientId = $('#edit-fu-patient-id').val();
    
        const updatedFollowUpData = {
            follow_up_date: $('#edit-fu-date').val(),
            pulse: $('#edit-fu-pulse').val() || null,
            respiratory_rate: $('#edit-fu-respiratory-rate').val() || null,
            temperature: $('#edit-fu-temperature').val() || null,
            blood_pressure: $('#edit-fu-blood_pressure').val() || null,
            weight_kg: $('#edit-fu-weight').val() || null,
            height_cm: $('#edit-fu-height').val() || null,
            known_case_of: $('#edit-fu-kco').val() || null,
            history_of: $('#edit-fu-ho').val() || null,
            complaint_of: $('#edit-fu-co').val() || null,
            on_examination: $('#edit-fu-oe').val() || null,
            treatment_advised: $('#edit-fu-treatment').val() || null,
            medicine_prescribed: $('#edit-fu-medicine').val() || null,
            follow_up_notes: $('#edit-fu-follow-up-notes').val() || null,
            last_menstrual_period: $('#edit-fu-lmp').val() || null,
            expected_delivery_date: $('#edit-fu-edd').val() || null,
            heartbeat: $('#edit-fu-heartbeat').val() || null,
            random_blood_sugar: $('#edit-fu-rbs').val() || null,
            haemoglobin: $('#edit-fu-hb').val() || null,
            urine_sugar: $('#edit-fu-urine-sugar').val() || null,
            urine_albumin: $('#edit-fu-urine-albumin').val() || null,
        };
    
        $.ajax({
            url: `${apiBaseUrl}/api/followups/${followUpId}`,
            type: 'PUT',
            contentType: 'application/json',
            data: JSON.stringify(updatedFollowUpData),
            success: function() {
                $('#edit-follow-up-modal').modal('hide');
                alert('Follow-up details updated successfully!');
                fetchAndShowPatientDetails(patientId);
                fetchMedicines();
            },
            error: function(xhr) {
                alert('Error updating follow-up: ' + xhr.responseText);
            }
        });
    });
    
    $('#patient-details-modal').on('click', '.view-follow-up-btn', function() {
        const followUpId = $(this).closest('tr').data('follow-up-id');
        const allFollowUps = $('#patient-details-modal').data('follow-ups');
        const followUpData = allFollowUps.find(fu => fu.id === followUpId);

        if (followUpData) {
            displayFullFollowUpDetails(followUpData);
        } else {
            alert('Error: Could not retrieve follow-up details.');
        }
    });

    function displayFullFollowUpDetails(data) {
        const content = `
            <p><strong>Follow-up Date:</strong> ${new Date(data.follow_up_date).toLocaleDateString()}</p>
            <hr>
            <h6>Vitals</h6>
            <div class="row">
                <div class="col-md-3"><p><strong>Pulse:</strong> ${data.pulse || 'N/A'}</p></div>
                <div class="col-md-3"><p><strong>Respiratory Rate:</strong> ${data.respiratory_rate || 'N/A'}</p></div>
                <div class="col-md-3"><p><strong>Temperature:</strong> ${data.temperature || 'N/A'}</p></div>
                <div class="col-md-3"><p><strong>Blood Pressure:</strong> ${data.blood_pressure || 'N/A'}</p></div>
                <div class="col-md-3"><p><strong>Weight (Kg):</strong> ${data.weight_kg || 'N/A'}</p></div>
                <div class="col-md-3"><p><strong>Height (cm):</strong> ${data.height_cm || 'N/A'}</p></div>
            </div>
            <hr>
            <h6>History & Notes</h6>
            <div class="row">
                <div class="col-md-6"><p><strong>Known Case Of (K/C/O):</strong><br>${data.known_case_of || 'N/A'}</p></div>
                <div class="col-md-6"><p><strong>History Of (H/O):</strong><br>${data.history_of || 'N/A'}</p></div>
                <div class="col-md-6"><p><strong>Complaint Of (C/O):</strong><br>${data.complaint_of || 'N/A'}</p></div>
                <div class="col-md-6"><p><strong>On Examination (O/E):</strong><br>${data.on_examination || 'N/A'}</p></div>
                <div class="col-md-6"><p><strong>Treatment Advised:</strong><br>${data.treatment_advised || 'N/A'}</p></div>
                <div class="col-md-6"><p><strong>Medicine Prescribed:</strong><br>${data.medicine_prescribed || 'N/A'}</p></div>
                <div class="col-md-12"><p><strong>Follow-up Notes:</strong><br>${data.follow_up_notes || 'N/A'}</p></div>
            </div>
            <hr>
            <h6>ANC / PNC / Child</h6>
            <div class="row">
                <div class="col-md-3"><p><strong>LMP:</strong> ${data.last_menstrual_period ? new Date(data.last_menstrual_period).toLocaleDateString() : 'N/A'}</p></div>
                <div class="col-md-3"><p><strong>EDD:</strong> ${data.expected_delivery_date ? new Date(data.expected_delivery_date).toLocaleDateString() : 'N/A'}</p></div>
                <div class="col-md-3"><p><strong>Heartbeat:</strong> ${data.heartbeat || 'N/A'}</p></div>
                <div class="col-md-3"><p><strong>RBS:</strong> ${data.random_blood_sugar || 'N/A'}</p></div>
                <div class="col-md-3"><p><strong>Hb:</strong> ${data.haemoglobin || 'N/A'}</p></div>
                <div class="col-md-3"><p><strong>Urine Sugar:</strong> ${data.urine_sugar || 'N/A'}</p></div>
                <div class="col-md-3"><p><strong>Urine Albumin:</strong> ${data.urine_albumin || 'N/A'}</p></div>
            </div>
        `;
        
        $('#followUpDetailsModalLabel').text(`Follow-up Details for ${new Date(data.follow_up_date).toLocaleDateString()}`);
        $('#full-follow-up-details-content').html(content);
        $('#follow-up-details-modal').modal('show');
    }


    $('#export-records-btn').on('click', function() {
        const searchTerm = $('#records-search-input').val();
        const startDate = $('#records-start-date').val();
        const endDate = $('#records-end-date').val();
        const params = new URLSearchParams();
        if (searchTerm) params.append('searchTerm', searchTerm);
        if (startDate) params.append('startDate', startDate);
        if (endDate) params.append('endDate', endDate);
        
        window.location.href = `${apiBaseUrl}/api/patient-records/export?${params.toString()}`;
    });

    $('#export-records-details-btn').on('click', function() {
        window.location.href = `${apiBaseUrl}/api/patient-records/export-details`;
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

    function populateMedicineDropdowns() {
        $.get(`${apiBaseUrl}/api/medicines`, function(medicines) {
            const addSelect = $('#fu-medicine-select');
            const editSelect = $('#edit-fu-medicine-select');
            addSelect.html('<option value="">-- Select Medicine --</option>');
            editSelect.html('<option value="">-- Select Medicine --</option>');
            medicines.forEach(med => {
                const remaining = med.stock_count - (med.issued_quantity || 0);
                if (remaining > 0) {
                    const option = `<option value="${med.name}">${med.name} (Rem: ${remaining})</option>`;
                    addSelect.append(option);
                    editSelect.append(option);
                }
            });
        });
    }

    // --- Prescription Management Logic ---
    function updatePrescription(listSelector, inputSelector) {
        const items = $(listSelector).find('li').map(function() {
            return $(this).data('prescription');
        }).get();
        $(inputSelector).val(items.join(', '));
    }

    function renderPrescriptionList(medString, listSelector, inputSelector) {
        const list = $(listSelector);
        list.empty();
        $(inputSelector).val(medString || '');
        if (!medString) return;

        const meds = medString.split(',').map(m => m.trim()).filter(m => m);
        const regex = /(.+?)\s*\((\d+)\)/;

        meds.forEach(medText => {
            const match = medText.match(regex);
            if(match) {
                 const name = match[1].trim();
                 const qty = match[2];
                 const prescription = `${name} (${qty})`;
                 list.append(`<li class="list-group-item list-group-item-sm py-1" data-prescription="${prescription}">${prescription} <button type="button" class="close remove-prescription-item">&times;</button></li>`);
            }
        });
    }

    $('#add-medicine-to-fu-btn').on('click', function() {
        addMedicineToPrescription(
            '#fu-medicine-select', 
            '#fu-medicine-quantity', 
            '#fu-prescription-list', 
            '#fu-medicine'
        );
    });

    $('#add-medicine-to-edit-fu-btn').on('click', function() {
        addMedicineToPrescription(
            '#edit-fu-medicine-select', 
            '#edit-fu-medicine-quantity', 
            '#edit-fu-prescription-list', 
            '#edit-fu-medicine'
        );
    });

    function addMedicineToPrescription(selectId, qtyId, listId, inputId) {
        const medName = $(selectId).val();
        const medQty = $(qtyId).val();
        if (!medName || !medQty || parseInt(medQty) <= 0) {
            alert('Please select a medicine and enter a valid quantity.');
            return;
        }
        const prescription = `${medName} (${medQty})`;
        $(listId).append(`<li class="list-group-item list-group-item-sm py-1" data-prescription="${prescription}">${prescription} <button type="button" class="close remove-prescription-item">&times;</button></li>`);
        updatePrescription(listId, inputId);

        $(qtyId).val('');
        $(selectId).val('');
    }
    
    $('body').on('click', '.remove-prescription-item', function() {
        const listItem = $(this).closest('li');
        const list = listItem.parent();
        const inputId = '#' + list.attr('id').replace('-list', '');
        listItem.remove();
        updatePrescription('#' + list.attr('id'), inputId);
    });


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
        const castes = ['General', 'OBC', 'SC/ST', 'Others'];
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
            $('#total-visits-count').text(response.total_visits);
            $('#unique-patient-count').text(response.unique_patients);
            $('#follow-up-visits-count').text(response.follow_up_visits);

            renderReportTable(response.data);
            if(response.total_visits > 0) $('#export-excel-btn').prop('disabled', false);
        }).fail(() => $('#report-table-container').html('<p class="text-danger text-center">Failed to load report.</p>'));
    });

    function renderReportTable(data) {
        const container = $('#report-table-container');
        if (data.length === 0) { container.html('<p class="text-muted text-center">No records found.</p>'); return; }
        const table = $('<table class="table table-hover table-sm"></table>');
        table.html(`<thead class="thead-light"><tr><th>Visit Date</th><th>Patient</th><th>Village</th><th>Program</th><th>Visit Type</th></tr></thead><tbody></tbody>`);
        const tbody = table.find('tbody');
        data.forEach(row => {
            tbody.append(`<tr>
                <td>${new Date(row.visit_date).toLocaleDateString()}</td>
                <td>${row.patient_name}</td>
                <td>${row.village_name}</td>
                <td>${row.program_type}</td>
                <td><span class="badge badge-${row.visit_type === 'Follow-up' ? 'success' : 'primary'}">${row.visit_type}</span></td>
            </tr>`);
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
        table.html(`<thead class="thead-light"><tr><th>Name</th><th>Total Stock</th><th>Issued</th><th>Remaining</th><th>Expiry</th><th>Actions</th></tr></thead><tbody></tbody>`);
        const tbody = table.find('tbody');
        const today = new Date(); today.setHours(0, 0, 0, 0);
        medicines.forEach(med => {
            const expiryDate = new Date(med.expiration_date);
            const issued = med.issued_quantity || 0;
            const remaining = med.stock_count - issued;
            let rowClass = (expiryDate < today) ? 'table-danger' : (remaining <= 10 ? 'table-warning' : '');
            tbody.append(`<tr class="${rowClass}" data-id="${med.id}" data-name="${med.name}" data-stock="${med.stock_count}" data-issued="${issued}">
                <td>${med.name}</td>
                <td>${med.stock_count}</td>
                <td>${issued}</td>
                <td>${remaining}</td>
                <td>${med.expiration_date}</td>
                <td>
                    <button class="btn btn-sm btn-success issue-med-btn" title="Issue Medicine"><i class="fas fa-arrow-circle-down"></i></button>
                    <button class="btn btn-sm btn-info update-stock-btn" title="Update Total Stock"><i class="fas fa-edit"></i></button> 
                    <button class="btn btn-sm btn-danger delete-med-btn" title="Delete"><i class="fas fa-trash"></i></button>
                </td>
            </tr>`);
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

    $('#medicine-table-container').on('click', '.issue-med-btn', function() {
        const tr = $(this).closest('tr');
        const medId = tr.data('id');
        const medName = tr.data('name');
        const totalStock = tr.data('stock');
        const issuedQty = tr.data('issued');
        const remainingQty = totalStock - issuedQty;

        $('#issue-med-id').val(medId);
        $('#issue-med-name').val(medName);
        $('#issue-med-remaining').val(remainingQty);
        $('#issue-med-quantity').val('').attr('max', remainingQty);
        $('#issue-medicine-modal').modal('show');
    });

    $('#issue-medicine-form').on('submit', function(e) {
        e.preventDefault();
        const medId = $('#issue-med-id').val();
        const quantity = parseInt($('#issue-med-quantity').val(), 10);
        const remaining = parseInt($('#issue-med-remaining').val(), 10);

        if (isNaN(quantity) || quantity <= 0) {
            alert('Please enter a valid quantity.');
            return;
        }
        if (quantity > remaining) {
            alert('Issue quantity cannot be greater than remaining stock.');
            return;
        }

        $.ajax({
            url: `${apiBaseUrl}/api/medicines/issue/${medId}`,
            type: 'POST',
            contentType: 'application/json',
            data: JSON.stringify({ quantity: quantity }),
            success: function() {
                $('#issue-medicine-modal').modal('hide');
                fetchMedicines();
            },
            error: function(xhr) {
                alert('Error issuing medicine: ' + xhr.responseText);
            }
        });
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
        const params = {
            startDate: $('#lab-filter-start-date').val(),
            endDate: $('#lab-filter-end-date').val()
        };

        $.get(`${apiBaseUrl}/api/lab-records`, params, function(records) {
            renderLabTable(records);
        }).fail(() => {
            $('#lab-table-container').html('<p class="text-danger text-center">Failed to load lab records.</p>');
        });
    }

    $('#lab-filter-btn').on('click', fetchLabRecords);


    function renderLabTable(records) {
        const container = $('#lab-table-container');
        if (records.length === 0) { container.html('<p class="text-muted text-center">No lab records found.</p>'); return; }
        const table = $('<table class="table table-hover table-sm"></table>');
        table.html(`<thead class="thead-light"><tr><th>Date</th><th>Patient</th><th>Father/Husband</th><th>Sex</th><th>Test</th><th>Positive</th><th>Negative</th><th>Actions</th></tr></thead><tbody></tbody>`);
        const tbody = table.find('tbody');
        records.forEach(row => {
            tbody.append(`
                <tr data-record-id="${row.id}">
                    <td>${row.test_date}</td>
                    <td>${row.patient_name}</td>
                    <td>${row.husband_father_name || ''}</td>
                    <td>${row.sex || ''}</td>
                    <td>${row.test_name}</td>
                    <td>${row.result_positive_reading || ''}</td>
                    <td>${row.result_negative_reading || ''}</td>
                    <td>
                        <button class="btn btn-sm btn-info edit-lab-btn" title="Edit"><i class="fas fa-edit"></i></button>
                        <button class="btn btn-sm btn-danger delete-lab-btn" title="Delete"><i class="fas fa-trash"></i></button>
                    </td>
                </tr>`);
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

    $('#lab-table-container').on('click', '.edit-lab-btn', function() {
        const recordId = $(this).closest('tr').data('record-id');
        $.get(`${apiBaseUrl}/api/lab-records/${recordId}`, function(record) {
            $('#edit-lab-record-id').val(record.id);
            $('#edit-lab-test-date').val(record.test_date);
            $('#edit-lab-test-name').val(record.test_name);
            $('#edit-lab-positive-reading').val(record.result_positive_reading);
            $('#edit-lab-negative-reading').val(record.result_negative_reading);
            $('#edit-lab-record-modal').modal('show');
        });
    });

    $('#edit-lab-record-form').on('submit', function(e) {
        e.preventDefault();
        const recordId = $('#edit-lab-record-id').val();
        const updatedData = {
            test_date: $('#edit-lab-test-date').val(),
            test_name: $('#edit-lab-test-name').val(),
            result_positive_reading: $('#edit-lab-positive-reading').val(),
            result_negative_reading: $('#edit-lab-negative-reading').val()
        };

        $.ajax({
            url: `${apiBaseUrl}/api/lab-records/${recordId}`,
            type: 'PUT',
            contentType: 'application/json',
            data: JSON.stringify(updatedData),
            success: function() {
                $('#edit-lab-record-modal').modal('hide');
                fetchLabRecords();
            },
            error: function() {
                alert('Error updating lab record.');
            }
        });
    });

    $('#lab-table-container').on('click', '.delete-lab-btn', function() {
        const recordId = $(this).closest('tr').data('record-id');
        if (confirm('Are you sure you want to delete this lab record?')) {
            $.ajax({
                url: `${apiBaseUrl}/api/lab-records/${recordId}`,
                type: 'DELETE',
                success: function() {
                    fetchLabRecords();
                },
                error: function() {
                    alert('Error deleting lab record.');
                }
            });
        }
    });
    
    $('#export-lab-btn').on('click', function() {
        window.location.href = `${apiBaseUrl}/api/lab-records/export`;
    });

    $('#generate-lab-count-btn').on('click', function() {
        const countUrl = new URL(`${apiBaseUrl}/api/lab-report-count`);
        const params = {
            startDate: $('#lab-count-start-date').val(),
            endDate: $('#lab-count-end-date').val()
        };
        if (params.startDate && params.endDate) {
            countUrl.searchParams.set('startDate', params.startDate);
            countUrl.searchParams.set('endDate', params.endDate);
        }
        
        $('#lab-count-table-container').html('<p class="text-muted text-center">Generating report...</p>');
        $('#export-lab-count-btn').prop('disabled', true);
        
        $.get(countUrl.toString(), function(data) {
            renderLabCountTable(data);
            if (data.length > 0) {
                $('#export-lab-count-btn').prop('disabled', false);
            }
        }).fail(() => $('#lab-count-table-container').html('<p class="text-danger text-center">Failed to generate report.</p>'));
    });

    function renderLabCountTable(data) {
        const container = $('#lab-count-table-container');
        if (data.length === 0) { container.html('<p class="text-muted text-center">No data for this period.</p>'); return; }
        const table = $('<table class="table table-hover table-sm"></table>');
        table.html(`<thead class="thead-light"><tr><th>Test Name</th><th>Total Tests</th><th>Positive</th><th>Negative</th><th>Abnormal</th><th>Normal</th></tr></thead><tbody></tbody>`);
        const tbody = table.find('tbody');
        data.forEach(row => {
            tbody.append(`<tr>
                <td>${row.test_name}</td>
                <td>${row.total_tests}</td>
                <td>${row.positive}</td>
                <td>${row.negative}</td>
                <td>${row.abnormal}</td>
                <td>${row.normal}</td>
            </tr>`);
        });
        container.html(table);
    }

    $('#export-lab-count-btn').on('click', function() {
        const exportUrl = new URL(`${apiBaseUrl}/api/lab-report-count/export`);
        const params = {
            startDate: $('#lab-count-start-date').val(),
            endDate: $('#lab-count-end-date').val()
        };
        if (params.startDate && params.endDate) {
            exportUrl.searchParams.set('startDate', params.startDate);
            exportUrl.searchParams.set('endDate', params.endDate);
        }
        window.location.href = exportUrl.toString();
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
        table.html(`<thead class="thead-light"><tr><th>Date</th><th>Time Out</th><th>Time In</th><th>Opening KMs</th><th>Closing KMs</th><th>Total KMs</th><th>Fuel (L)</th><th>Villages</th></tr></thead><tbody></tbody>`);
        const tbody = table.find('tbody');
        entries.forEach(row => {
            tbody.append(`<tr><td>${row.entry_date}</td><td>${row.time_out || ''}</td><td>${row.time_in || ''}</td><td>${row.kms_opening || ''}</td><td>${row.kms_closing || ''}</td><td>${row.total_kms || ''}</td><td>${row.fuel_quantity || ''}</td><td>${row.villages_visited || ''}</td></tr>`);
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

    // --- Activity Log Page Logic ---
    function fetchActivityLog() {
        $('#activity-log-table-container').html('<p class="text-muted text-center">Loading log...</p>');
        $.get(`${apiBaseUrl}/api/activity-log`, function(logs) {
            renderActivityLogTable(logs);
        }).fail(() => {
            $('#activity-log-table-container').html('<p class="text-danger text-center">Failed to load activity log.</p>');
        });
    }

    function renderActivityLogTable(logs) {
        const container = $('#activity-log-table-container');
        if (logs.length === 0) {
            container.html('<p class="text-muted text-center">No activities recorded yet.</p>');
            return;
        }
        const table = $('<table class="table table-hover table-sm"></table>');
        table.html(`<thead class="thead-light"><tr><th style="width: 20%;">Timestamp</th><th style="width: 20%;">Action</th><th>Details</th></tr></thead><tbody></tbody>`);
        const tbody = table.find('tbody');
        logs.forEach(log => {
            tbody.append(`
                <tr>
                    <td>${log.timestamp}</td>
                    <td><span class="badge badge-info">${log.action}</span></td>
                    <td>${log.details}</td>
                </tr>
            `);
        });
        container.html(table);
    }

    $('#refresh-log-btn').on('click', fetchActivityLog);


    // --- Initial Page Load ---
    populateVillageFilter();
    populateProgramAndCasteFilters();
    populateAllPatientDropdowns();
    populateMedicineDropdowns();
    populateYearSelect();
    
    // Set the default page to dashboard and load stats
    $('#nav-dashboard').trigger('click');
});
