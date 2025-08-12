"use strict";

// Class definition
var KTCustomersList = function () {
    // Define shared variables
    var datatable;

    var table = document.getElementById('kt_customers_table')

    // Private functions
    var initCustomerList = function () {
        // Set date data order


        // Init datatable --- more info on datatables: https://datatables.net/manual/
        datatable = $(table).DataTable({
            // responsive: true
        })


        // Re-init functions on every table re-draw -- more info: https://datatables.net/reference/event/draw
        datatable.on('draw', function () { });
    }

    // Search Datatable --- official docs reference: https://datatables.net/reference/api/search()
    var handleSearchDatatable = () => {
        const filterSearch = document.querySelector('[data-kt-customer-table-filter="search"]');
        filterSearch.addEventListener('keyup', function (e) {
            datatable.search(e.target.value.trim()).draw();
        });
    }

    // Handle status filter dropdown
    var handleStatusFilter = () => {

        const filterStatus = document.querySelector('[data-kt-status-filter="status"]');
        $(filterStatus).on('change', e => {

            let value = e.target.value;

            // If "All" is selected, clear the search filter
            if (value === 'all') {
                datatable.search('').columns().search('').draw();
            } else {
                datatable.search(value).draw();
            }
        });
    }

    // Handle status filter dropdown
    const handleSubscriptionStatusFilter = () => {

        const filterStatus = document.querySelector('[data-kt-subscription-status-filter="status"]');
        // console.log("filterStatus ==>", filterStatus);

        $(filterStatus).on('change', e => {
            let value = e.target.value;
            if (e.target.value === 'all') {
                e.target.value = '';
            }
            datatable.search(e.target.value).draw();
        });
    };

    // Init flatpickr --- more info :https://flatpickr.js.org/getting-started/
    var initFlatpickr = () => {

        const element = document.querySelector('#kt_Booking_flatpickr');
        // console.log("element ==>", element);
        flatpickr = $(element).flatpickr({
            altInput: true,
            altFormat: "d/m/Y",
            dateFormat: "Y-m-d",
            mode: "range",
            onChange: function (selectedDates, dateStr, instance) {
                handleFlatpickr(selectedDates, dateStr, instance);
            },
        });

    }

    // Handle flatpickr
    var handleFlatpickr = (selectedDates, dateStr, instance) => {
        // Extract the minimum and maximum dates from the selected dates
        let minDate = selectedDates[0];
        let maxDate = selectedDates[1];

        // Convert dates to Moment.js objects and set start/end of the day
        minDate = minDate ? moment(minDate).startOf('day').toDate() : null;
        maxDate = maxDate ? moment(maxDate).endOf('day').toDate() : null;

        // Format the dates for display
        let formattedMinDate = minDate ? moment(minDate).format('MMMM DD, YYYY') : 'N/A';
        let formattedMaxDate = maxDate ? moment(maxDate).format('MMMM DD, YYYY') : 'N/A';

        // Log the selected date range
        console.log("Formatted minDate ===>", formattedMinDate);
        console.log("Formatted maxDate ===>", formattedMaxDate);

        // Display the formatted dates in the UI, e.g., in an HTML element
        $('#dateRangeDisplay').text(`From ${formattedMinDate} to ${formattedMaxDate}`);

        // Clear any previous custom filter functions to avoid duplication
        $.fn.dataTable.ext.search = []; // Reset search functions

        // Add a new custom filter function to the DataTable
        $.fn.dataTable.ext.search.push(function (settings, data, dataIndex) {
            // Get the date from the DataTable row and convert it to a Date object
            let dateAdded = new Date(moment(data[3])); // Assuming data[3] is the date column

            // Perform the date range comparison
            return (
                (minDate === null || dateAdded >= minDate) &&
                (maxDate === null || dateAdded <= maxDate)
            );
        });

        // Redraw the DataTable to apply the new filter
        datatable.draw();
    };


    // Handle clear flatpickr
    var handleClearFlatpickr = () => {
        const clearButton = document.querySelector('#kt_booking_flatpickr_clear');
        if (clearButton) {
            clearButton.addEventListener('click', e => {
                flatpickr.clear();
            });
        }
    }

    // Public methods
    return {
        init: function () {
            table = document.querySelector('#kt_customers_table');

            if (!table) {
                return;
            }

            initCustomerList();
            handleSearchDatatable();
            handleStatusFilter();
            handleSubscriptionStatusFilter();
            initFlatpickr();
            handleClearFlatpickr();
        }
    }

}();

// On document ready
KTUtil.onDOMContentLoaded(function () {
    KTCustomersList.init();
});