
$(document).ready(function () {
  let unreadCount = 0; // Variable to store unread notifications count

  // Function to fetch notifications and update UI
  function fetchNotifications() {
    $.ajax({
      url: BASE_URL + 'get-notification',
      type: 'GET',
      dataType: 'json',
      success: function (data) {


        unreadCount = 0;
        let notificationsHTML = '';
        if (!data.notifications.length) {
          // Display message when no notifications are found
          notificationsHTML = `
              <div class="d-flex flex-column px-9">
                <div class="text-center px-4 pt-20 symbol symbol-circle symbol-100px ">
                  <img class="mw-100 mh-100px" alt="No Notifications" src="assets/media/illustrations/notification-icon.png">
                </div>
                <div class="pt-3 pb-0">
                  <h3 class="text-gray-900 text-center fw-bold">
                    No Notifications Yet
                  </h3>
                  <div class="text-center text-gray-600 fw-semibold pt-1">
                    Your notifications list is empty.
                  </div>
                </div>
              </div>
            `;
        } else {
          // Iterate through notifications data
          data.notifications.forEach(notification => {
            notificationsHTML += `
                <div class="border border-dashed border-gray-300 rounded px-7 py-3 mb-6">
                  <div class="d-flex flex-stack mb-2">
                    <div class="me-3">
                      <span class="text-gray-700 fs-6 fw-bold">${notification.title}</span>
                    </div>
                    <div class="m-0">
                      <span class="text-gray-700 fw-bold">${new Date(notification.createdAt).toLocaleDateString('en-US', { timeZone: data.timezones.timezone ? data.timezones.timezone : "America/Chicago", year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: 'numeric' })}</span>
                    </div>
                  </div>
                  <div class="d-flex flex-stack">
                    <span class="text-gray-500 fw-bold">${notification.message} ${notification.is_read ? '<div class="badge badge-light-success">Read</div>' : '<div class="badge badge-light-danger">Unread</div>'}</span>
                  </div>
                </div>
              `;

            if (!notification.is_read) {
              unreadCount++;
            }
          });
        }

        // Update notifications container
        $('#notifications').html(notificationsHTML);

        // Update notification count display
        $('.notification-count').text(unreadCount);

        // Update notification icon based on unread notifications
        if (unreadCount > 0) {
          $('#unread-notification-icon').removeClass('d-none');
          $('#unread-notification-count').removeClass('d-none');
          $('#notification-icon-btn').addClass('d-none');
        } else {
          $('#unread-notification-icon').addClass('d-none');
          $('#unread-notification-count').addClass('d-none');
          $('#notification-icon-btn').removeClass('d-none');
        }
      },
      error: function (err) {
        console.error('Error fetching notifications:', err);
      }
    });
  }

  // Initial fetch of notifications
  fetchNotifications();

  // Set interval to fetch notifications every 10 seconds (10000 ms)
  setInterval(fetchNotifications, 10000);

  // Handling click on the notification icon to fetch notifications
  $('#notification-icon').on('click', function () {
    fetchNotifications();
  });
});

