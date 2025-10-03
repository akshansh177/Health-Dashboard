CREATE DATABASE IF NOT EXISTS healthdata2;

-- Use the new database
USE healthdata2;

-- Create the villages table
CREATE TABLE IF NOT EXISTS villages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE
);

-- Create the patients table with all columns
CREATE TABLE IF NOT EXISTS patients (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    husband_father_name VARCHAR(255),
    age INT,
    sex VARCHAR(10),
    caste VARCHAR(50) DEFAULT 'General',
    village_id INT,
    program_type VARCHAR(50) DEFAULT 'General',
    registration_date DATE NOT NULL,
    FOREIGN KEY (village_id) REFERENCES villages(id) ON DELETE SET NULL
);

-- Create the detailed follow_ups table with optional fields
CREATE TABLE IF NOT EXISTS follow_ups (
    id INT AUTO_INCREMENT PRIMARY KEY,
    patient_id INT NOT NULL,
    follow_up_date DATE NOT NULL,
    pulse VARCHAR(50) NULL,
    respiratory_rate VARCHAR(50) NULL,
    temperature VARCHAR(50) NULL,
    blood_pressure VARCHAR(50) NULL,
    weight_kg DECIMAL(5, 2) NULL,
    height_cm DECIMAL(5, 1) NULL,
    random_blood_sugar VARCHAR(50) NULL,
    haemoglobin VARCHAR(50) NULL,
    known_case_of TEXT NULL,
    history_of TEXT NULL,
    complaint_of TEXT NULL,
    on_examination TEXT NULL,
    treatment_advised TEXT NULL,
    medicine_prescribed TEXT NULL,
    follow_up_notes TEXT NULL,
    last_menstrual_period DATE NULL,
    expected_delivery_date DATE NULL,
    heartbeat VARCHAR(50) NULL,
    urine_sugar VARCHAR(50) NULL,
    urine_albumin VARCHAR(50) NULL,
    FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
);

-- Create the medicine_inventory table
CREATE TABLE IF NOT EXISTS medicine_inventory (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    stock_count INT NOT NULL DEFAULT 0,
    expiration_date DATE NOT NULL
);

-- Create the lab_tests table
CREATE TABLE IF NOT EXISTS lab_tests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    patient_id INT NOT NULL,
    test_date DATE NOT NULL,
    test_name VARCHAR(255) NOT NULL,
    result_positive_reading VARCHAR(255) NULL,
    result_negative_reading VARCHAR(255) NULL,
    FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
);