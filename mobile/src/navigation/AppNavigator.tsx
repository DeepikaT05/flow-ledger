import React from 'react';
import { View, ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import { C } from '../theme';

import { LoginScreen } from '../screens/LoginScreen';
import { CompanySelectScreen } from '../screens/CompanySelectScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { MenuScreen } from '../screens/MenuScreen';
import { BillListScreen } from '../screens/BillListScreen';
import { BillDetailScreen } from '../screens/BillDetailScreen';
import { BillEntryScreen } from '../screens/BillEntryScreen';
import { VoucherListScreen } from '../screens/VoucherListScreen';
import { VoucherDetailScreen } from '../screens/VoucherDetailScreen';
import { VoucherEntryScreen } from '../screens/VoucherEntryScreen';
import { LedgerListScreen } from '../screens/LedgerListScreen';
import { LedgerStatementScreen } from '../screens/LedgerStatementScreen';
import { LedgerEntryScreen } from '../screens/LedgerEntryScreen';
import { GroupEntryScreen } from '../screens/GroupEntryScreen';
import { PartyStatusScreen } from '../screens/PartyStatusScreen';
import { ReportScreen } from '../screens/ReportScreen';
import { StockScreen } from '../screens/StockScreen';

const Stack = createNativeStackNavigator();

export const AppNavigator: React.FC = () => {
  const { user, company, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.navy }}>
        <ActivityIndicator size="large" color={C.gold} />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
        {!user ? (
          <Stack.Screen name="Login" component={LoginScreen} />
        ) : !company ? (
          <Stack.Screen name="CompanySelect" component={CompanySelectScreen} />
        ) : (
          <>
            <Stack.Screen name="Home" component={HomeScreen} />
            <Stack.Screen name="Menu" component={MenuScreen} />
            <Stack.Screen name="BillList" component={BillListScreen} />
            <Stack.Screen name="BillDetail" component={BillDetailScreen} />
            <Stack.Screen name="BillEntry" component={BillEntryScreen} />
            <Stack.Screen name="VoucherList" component={VoucherListScreen} />
            <Stack.Screen name="VoucherDetail" component={VoucherDetailScreen} />
            <Stack.Screen name="VoucherEntry" component={VoucherEntryScreen} />
            <Stack.Screen name="LedgerList" component={LedgerListScreen} />
            <Stack.Screen name="LedgerStatement" component={LedgerStatementScreen} />
            <Stack.Screen name="LedgerEntry" component={LedgerEntryScreen} />
            <Stack.Screen name="GroupEntry" component={GroupEntryScreen} />
            <Stack.Screen name="PartyStatus" component={PartyStatusScreen} />
            <Stack.Screen name="Report" component={ReportScreen} />
            <Stack.Screen name="Stock" component={StockScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
};
