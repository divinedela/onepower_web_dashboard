var KTAppCKEditorInit = (function () {
  // Default configuration for all editors
  const defaultConfig = {
    toolbar: {
      items: [
        'undo', 'redo', '|',
        'heading', '|',
        'bold', 'italic', '|',
        'bulletedList', 'numberedList', '|',
      ]
    },
    language: 'en',
    placeholder: "Type your content here...",
    heading: {
      options: [
        { model: 'paragraph', title: 'Paragraph', class: 'ck-heading_paragraph' },
        { model: 'heading1', view: 'h1', title: 'Heading 1', class: 'ck-heading_heading1' },
        { model: 'heading2', view: 'h2', title: 'Heading 2', class: 'ck-heading_heading2' },
        { model: 'heading3', view: 'h3', title: 'Heading 3', class: 'ck-heading_heading3' },
        { model: 'heading4', view: 'h4', title: 'Heading 4', class: 'ck-heading_heading4' },
        { model: 'heading5', view: 'h5', title: 'Heading 5', class: 'ck-heading_heading5' },
        { model: 'heading6', view: 'h6', title: 'Heading 6', class: 'ck-heading_heading6' }
      ]
    }
  };

  // Initialize CKEditor on specified textareas
  const initCkEditors = (configOverrides = {}) => {
    const textareas = [
      'kt_docs_first_ckeditor_classic',
      'kt_docs_second_ckeditor_classic',
      'kt_docs_third_ckeditor_classic'
    ];

    textareas.forEach(textareaId => {
      const editorElement = document.getElementById(textareaId);

      if (editorElement) {
        ClassicEditor
          .create(editorElement, { ...defaultConfig, ...configOverrides })
          .then(editor => {
          })
          .catch(error => {
            console.error(`Error initializing editor for #${textareaId}`, error);
            // Optionally handle UI notification of the failure to the user
          });
      }
    });
  };

  // Publicly accessible method to initialize the module
  return {
    init: function (configOverrides) {
      initCkEditors(configOverrides);
    }
  };
})();

// On document ready
document.addEventListener("DOMContentLoaded", function () {
  KTAppCKEditorInit.init();
});
