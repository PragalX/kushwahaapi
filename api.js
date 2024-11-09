const axios = require('axios');
const cheerio = require('cheerio');

const BASE_URL = 'http://results.beup.ac.in/ResultsBTech1stSem2023_B2023Pub.aspx';

async function fetchWithRetries(url, maxRetries = 3, initialDelay = 1000, backoffFactor = 2.0) {
    let delay = initialDelay;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            const response = await axios.get(url);
            if (response.status === 200 && !response.data.includes("No Record Found !!!")) {
                return response.data;
            }
            return null;
        } catch (error) {
            if (attempt === maxRetries - 1) {
                return { error: error.message };
            }
            await new Promise(resolve => setTimeout(resolve, delay));
            delay *= backoffFactor;
        }
    }
}

function parseStudentData(html, regNo) {
    if (!html) return null;
    const $ = cheerio.load(html);

    const data = {
        registration_no: regNo,
        university: "Bihar Engineering University, Patna",
        exam_name: $("#ContentPlaceHolder1_DataList4_Exam_Name_0").text().trim() || "N/A",
        semester: $("#ContentPlaceHolder1_DataList2_Exam_Name_0").text().trim() || "I",
        exam_date: $("#ContentPlaceHolder1_DataList2 td:nth-of-type(2)").text().split(":").pop().trim() || "N/A",
        student_name: $("#ContentPlaceHolder1_DataList1_StudentNameLabel_0").text().trim() || "N/A",
        college_name: $("#ContentPlaceHolder1_DataList1_CollegeNameLabel_0").text().trim() || "N/A",
        course_name: $("#ContentPlaceHolder1_DataList1_CourseLabel_0").text().trim() || "N/A",
    };

    data.theory_subjects = [];
    $("#ContentPlaceHolder1_GridView1 tr").slice(1).each((i, el) => {
        const cells = $(el).find("td");
        if (cells.length >= 7) {
            data.theory_subjects.push({
                subject_code: $(cells[0]).text().trim(),
                subject_name: $(cells[1]).text().trim(),
                ese: $(cells[2]).text().trim(),
                ia: $(cells[3]).text().trim(),
                total: $(cells[4]).text().trim(),
                grade: $(cells[5]).text().trim(),
                credit: $(cells[6]).text().trim(),
            });
        }
    });

    data.practical_subjects = [];
    $("#ContentPlaceHolder1_GridView2 tr").slice(1).each((i, el) => {
        const cells = $(el).find("td");
        if (cells.length >= 7) {
            data.practical_subjects.push({
                subject_code: $(cells[0]).text().trim(),
                subject_name: $(cells[1]).text().trim(),
                ese: $(cells[2]).text().trim(),
                ia: $(cells[3]).text().trim(),
                total: $(cells[4]).text().trim(),
                grade: $(cells[5]).text().trim(),
                credit: $(cells[6]).text().trim(),
            });
        }
    });

    data.sgpa = $("#ContentPlaceHolder1_DataList5_GROSSTHEORYTOTALLabel_0").text().trim() || "SGPA not found";

    const semesterGrades = {};
    $("#ContentPlaceHolder1_GridView3 tr:nth-child(2) td").each((index, cell) => {
        const semesterKeys = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "Cur. CGPA"];
        semesterGrades[semesterKeys[index]] = $(cell).text().trim() || "NA";
    });
    data.semester_grades = semesterGrades;

    data.remarks = $("#ContentPlaceHolder1_DataList3_remarkLabel_0").text().includes("FAIL:")
        ? `FAIL: ${$("#ContentPlaceHolder1_DataList3_remarkLabel_0").text().split("FAIL:")[1].trim()}`
        : $("#ContentPlaceHolder1_DataList3_remarkLabel_0").text().trim();
    data.publish_date = $("#ContentPlaceHolder1_DataList3 tr:nth-of-type(2) td").text().split(":").pop().trim() || "";

    return data;
}

module.exports = async (req, res) => {
    const { reg_no } = req.query;
    const sem = req.query.sem || "I";
    if (!reg_no) {
        return res.status(400).json({ error: "Missing 'reg_no' query parameter" });
    }

    const regBase = reg_no.slice(0, -3);
    const startNum = parseInt(reg_no.slice(-3), 10);
    const batchSize = 5;
    const results = [];

    for (let i = startNum; i < startNum + batchSize; i++) {
        const currentRegNo = `${regBase}${String(i).padStart(3, '0')}`;
        const url = `${BASE_URL}?Sem=${sem}&RegNo=${currentRegNo}`;
        const pageContent = await fetchWithRetries(url);
        const result = parseStudentData(pageContent, currentRegNo);

        if (result) results.push(result, { separator: "************************************" });
    }

    res.status(200).json(results);
};
