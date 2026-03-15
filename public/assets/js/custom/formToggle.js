document.addEventListener('DOMContentLoaded', function () {

    // Function to set up mode toggling on a form
    function setupModeToggle(formId, testModeRadioId, liveModeRadioId, testInputsId, liveInputsId) {

        const form = document.getElementById(formId);

        if (!form) {
            return;
        }

        const testModeRadio = document.getElementById(testModeRadioId);
        const liveModeRadio = document.getElementById(liveModeRadioId);
        const testInputs = document.getElementById(testInputsId);
        const liveInputs = document.getElementById(liveInputsId);

        // Function to toggle input visibility and requirement based on test/live mode
        function toggleInputVisibility() {

            if (testModeRadio.checked) {

                testInputs.style.display = 'block';
                liveInputs.style.display = 'none';
                testInputs.querySelectorAll('input').forEach(input => input.required = true);
                liveInputs.querySelectorAll('input').forEach(input => input.required = false);

            } else if (liveModeRadio.checked) {

                testInputs.style.display = 'none';
                liveInputs.style.display = 'block';
                testInputs.querySelectorAll('input').forEach(input => input.required = false);
                liveInputs.querySelectorAll('input').forEach(input => input.required = true);
            }
        }

        // Attach event listeners to the radio buttons
        testModeRadio.addEventListener('change', toggleInputVisibility);
        liveModeRadio.addEventListener('change', toggleInputVisibility);

        // Initial toggle on load to set the correct display and requirements
        toggleInputVisibility();
    }

    // Setup for Stripe form
    setupModeToggle('payment_gateway_strip_form', 'stripe_testModeRadio', 'stripe_liveModeRadio', 'test_mode_inputs', 'live_mode_inputs');

    // Setup for Razorpay form
    setupModeToggle('payment_gateway_razorpay_form', 'razorpay_testModeRadio', 'razorpay_liveModeRadio', 'razorpay_test_mode_inputs', 'razorpay_live_mode_inputs');

    // Setup for paypal form
    setupModeToggle('payment_gateway_paypal_form', 'paypal_testModeRadio', 'paypal_liveModeRadio', 'paypal_test_mode_inputs', 'paypal_live_mode_inputs');

});
