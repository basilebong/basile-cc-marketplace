from rest_framework import generics, permissions, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework import serializers
from .models import Notification


class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = ["id", "notification_type", "message", "is_read", "link", "created_at"]
        read_only_fields = ["id", "notification_type", "message", "link", "created_at"]


class NotificationListView(generics.ListAPIView):
    """List notifications for the current user. No pagination yet."""
    serializer_class = NotificationSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Notification.objects.filter(recipient=self.request.user)


# TODO: add mark-as-read endpoint (PATCH /notifications/:id/)
# TODO: add mark-all-as-read endpoint (POST /notifications/mark-all-read/)
# TODO: add notification preferences (user can mute certain types)
# TODO: integrate with Celery to send email notifications
# TODO: add WebSocket consumer for real-time push notifications

@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def mark_read(request, pk):
    """Stub — mark a single notification as read."""
    try:
        notification = Notification.objects.get(pk=pk, recipient=request.user)
    except Notification.DoesNotExist:
        return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
    notification.is_read = True
    notification.save(update_fields=["is_read"])
    return Response(NotificationSerializer(notification).data)
