import requests

url = "http://localhost:8000/api/detection/image/"
files = {'image': open('test.jpg', 'rb')}
data = {'category': 'vehicle'}

response = requests.post(url, files=files, data=data)
print(response.status_code)
print(response.text[:500])
