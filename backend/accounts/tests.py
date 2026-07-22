from django.urls import reverse
from rest_framework.test import APITestCase
from rest_framework import status
from django.contrib.auth import get_user_model

User = get_user_model()

class AuthTests(APITestCase):
    def setUp(self):
        self.register_url = reverse('register')
        self.login_url = reverse('token_obtain_pair')
        self.logout_url = reverse('logout')
        self.profile_url = reverse('profile')
        self.change_password_url = reverse('change_password')
        self.user_data = {
            'username': 'testuser',
            'email': 'testuser@example.com',
            'contact_no': '9876543210',
            'password': 'StrongPassword123'
        }
    
    def test_register_user(self):
        response = self.client.post(self.register_url, self.user_data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(User.objects.count(), 1)
        self.assertEqual(User.objects.get().username, 'testuser')

    def test_login_user(self):
        User.objects.create_user(**self.user_data)
        response = self.client.post(self.login_url, {
            'username': 'testuser',
            'password': 'StrongPassword123'
        })
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('access', response.data)
        self.assertIn('refresh', response.data)

    def test_logout_user(self):
        User.objects.create_user(**self.user_data)
        login_response = self.client.post(self.login_url, {
            'username': 'testuser',
            'password': 'StrongPassword123'
        })
        refresh_token = login_response.data['refresh']
        access_token = login_response.data['access']
        
        self.client.credentials(HTTP_AUTHORIZATION='Bearer ' + access_token)
        response = self.client.post(self.logout_url, {'refresh': refresh_token})
        self.assertEqual(response.status_code, status.HTTP_205_RESET_CONTENT)
        
        # Test reuse should fail (blacklist)
        response_reuse = self.client.post(reverse('token_refresh'), {'refresh': refresh_token})
        self.assertEqual(response_reuse.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_profile_read_and_patch(self):
        User.objects.create_user(**self.user_data)
        login_response = self.client.post(self.login_url, {
            'username': 'testuser',
            'password': 'StrongPassword123'
        })
        self.client.credentials(HTTP_AUTHORIZATION='Bearer ' + login_response.data['access'])
        
        # Read
        response = self.client.get(self.profile_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['firstname'], "")
        
        # Patch
        response = self.client.patch(self.profile_url, {'firstname': 'John'})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['firstname'], 'John')

    def test_change_password(self):
        user = User.objects.create_user(**self.user_data)
        login_response = self.client.post(self.login_url, {
            'username': 'testuser',
            'password': 'StrongPassword123'
        })
        self.client.credentials(HTTP_AUTHORIZATION='Bearer ' + login_response.data['access'])
        
        response = self.client.post(self.change_password_url, {
            'old_password': 'StrongPassword123',
            'new_password': 'NewStrongPassword123'
        })
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        user.refresh_from_db()
        self.assertTrue(user.check_password('NewStrongPassword123'))
